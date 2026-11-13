from django.db import models
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.audit.services import log_action
from apps.common.mixins import TenantContextMixin
from apps.common.permissions import (
    HasRole,
    IsAdminForWriteActions,
    IsStaffForWriteActions,
    IsTenantMember,
)
from apps.common.views import TenantScopedViewSet, YearAwareViewSet
from apps.people.models import Enrollment, TeacherAssignment
from apps.tenants.permissions import user_can

from .models import AttendanceRecord, AttendanceSession, GroupSchedule
from .serializers import (
    AttendanceRecordSerializer,
    AttendanceSessionSerializer,
    BulkMarkInputSerializer,
    GroupScheduleSerializer,
    ManualMarkInputSerializer,
    MarkQRInputSerializer,
    NotifyParentsInputSerializer,
    StudentAttendanceRecordSerializer,
    TodaySessionSerializer,
)
from .services import (
    _effective_late_boundary,
    close_session,
    current_qr_payload,
    manual_mark,
    mark_via_qr,
    open_session,
    reopen_session,
    teacher_can_manage_group,
)


class AttendanceSessionViewSet(YearAwareViewSet):
    """CRUD + custom actions for sessions.

    Read visibility (mirrors Enrollment/Attempt scoping):
      - OWNER/ADMIN: all sessions in the tenant
      - TEACHER: sessions for groups they're assigned to (or the whole
        grade if unnarrowed)
      - STUDENT: sessions for their own groups (read-only, for their
        attendance history)
    """

    queryset = AttendanceSession.objects.all()
    serializer_class = AttendanceSessionSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [
        IsStaffForWriteActions,
    ]
    filterset_fields = ["group", "course", "teacher", "status", "date"]
    ordering_fields = ["date", "start_time", "status", "created_at"]
    ordering = ["-date", "-start_time"]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if (
            request.method not in SAFE_METHODS
            and request.user.role == User.Role.TEACHER
            and not user_can(request.user, "teachers_can_mark_attendance")
        ):
            raise PermissionDenied("إدارة الحضور غير مسموحة لك حسب إعدادات المؤسسة.")

    def get_queryset(self):
        qs = super().get_queryset().select_related("group", "course", "lesson", "teacher")
        user = self.request.user

        if user.role in (User.Role.OWNER, User.Role.ADMIN):
            return qs

        if user.role == User.Role.STUDENT:
            student_group_ids = (
                Enrollment.objects.for_tenant(self.request.tenant)
                .filter(student=user, status=Enrollment.Status.ACTIVE)
                .values_list("group_id", flat=True)
            )
            return qs.filter(group_id__in=student_group_ids)

        # TEACHER — sessions they own OR (via assignment) for a group
        # they're assigned to. Same rule used for enrollment scoping.
        assignments = TeacherAssignment.objects.for_tenant(self.request.tenant).filter(teacher=user)
        narrowed = assignments.filter(groups__isnull=False).values_list("groups__id", flat=True)
        whole_grade = assignments.filter(groups__isnull=True).values_list(
            "course__grade_id", flat=True
        )
        return qs.filter(
            models.Q(teacher=user)
            | models.Q(group_id__in=list(narrowed))
            | models.Q(group__grade_id__in=list(whole_grade))
        ).distinct()

    def perform_create(self, serializer):
        group = serializer.validated_data["group"]
        user = self.request.user

        # Teachers can only create sessions for their assigned groups.
        if user.role == User.Role.TEACHER:
            if not teacher_can_manage_group(user, group):
                raise PermissionDenied("لا يمكنك إنشاء جلسة لمجموعة خارج نطاق تكليفاتك.")
            # Force teacher = caller (unless admin explicitly picks another).
            if "teacher" not in serializer.validated_data:
                serializer.validated_data["teacher"] = user

        super().perform_create(serializer)
        log_action(
            actor=user,
            tenant=self.request.tenant,
            action="attendance_session.created",
            obj=serializer.instance,
            metadata={"group": group.name, "date": str(serializer.instance.date)},
        )

    # ------------------------------------------------------------------
    # Open / close / reopen
    # ------------------------------------------------------------------

    @action(detail=True, methods=["post"])
    def open(self, request, pk=None):
        session = self.get_object()
        self._ensure_can_operate(session)
        open_session(session, by_user=request.user)
        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="attendance_session.opened",
            obj=session,
        )
        return Response(self.get_serializer(session).data)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        """Close the session. Absence notifications dispatch automatically
        via `close_session()` → `transaction.on_commit()` (F-02).
        """
        session = self.get_object()
        self._ensure_can_operate(session)
        close_session(session, by_user=request.user)
        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="attendance_session.closed",
            obj=session,
        )
        session.refresh_from_db()
        return Response(self.get_serializer(session).data)

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        session = self.get_object()
        self._ensure_can_operate(session)
        reopen_session(session, by_user=request.user)
        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="attendance_session.reopened",
            obj=session,
        )
        return Response(self.get_serializer(session).data)

    def _ensure_can_operate(self, session):
        user = self.request.user
        if user.role in (User.Role.OWNER, User.Role.ADMIN):
            return
        if user.role == User.Role.TEACHER:
            if not user_can(user, "teachers_can_mark_attendance"):
                raise PermissionDenied("إدارة الحضور غير مسموحة لك حسب إعدادات المؤسسة.")
            if session.teacher_id == user.id:
                return
            if teacher_can_manage_group(user, session.group):
                return
        raise PermissionDenied("لا يمكنك إدارة هذه الجلسة.")

    # ------------------------------------------------------------------
    # Quick start — one-click "start attendance now"
    # ------------------------------------------------------------------

    @action(detail=False, methods=["post"], url_path="quick-start")
    def quick_start(self, request):
        """POST /attendance/sessions/quick-start/

        One-click session creation: creates AND opens a session in a
        single call. Any omitted field is auto-filled with smart defaults:
          - date: today
          - start_time: now (rounded down to the minute)
          - end_time: start_time + 60 minutes
          - mode: HYBRID
          - teacher: current user if TEACHER, else first assigned teacher

        If an OPEN session for the same group already exists today, it is
        returned instead of creating a duplicate — resuming a live class
        is the common case (teacher reload, second device, etc.).
        """
        from datetime import datetime, timedelta

        from django.utils import timezone as dj_tz

        from apps.academics.models import Group

        group_id = request.data.get("group")
        if not group_id:
            return Response(
                {"error": {"status": 400, "detail": "المجموعة مطلوبة."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        group = Group.objects.for_tenant(request.tenant).filter(id=group_id).first()
        if group is None:
            return Response(
                {"error": {"status": 404, "detail": "المجموعة غير موجودة."}},
                status=status.HTTP_404_NOT_FOUND,
            )
        self._check_year_writable(instance=group)

        # Teacher scope check
        user = request.user
        if user.role == User.Role.TEACHER:
            if not teacher_can_manage_group(user, group):
                raise PermissionDenied("لا يمكنك بدء جلسة لمجموعة خارج نطاق تكليفاتك.")

        today = dj_tz.localdate()

        # Resume: if an OPEN session for this group exists today, return it.
        existing_open = (
            AttendanceSession.objects.for_tenant(request.tenant)
            .filter(
                group=group,
                date=today,
                status=AttendanceSession.Status.OPEN,
            )
            .first()
        )
        if existing_open is not None:
            data = self.get_serializer(existing_open).data
            data["created"] = False
            return Response(data, status=status.HTTP_200_OK)

        # Parse or default the schedule.
        now = dj_tz.localtime()
        try:
            date_val = request.data.get("date") or today.isoformat()
            date_obj = datetime.strptime(date_val, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            date_obj = today

        start_str = request.data.get("start_time")
        if start_str:
            try:
                start_obj = datetime.strptime(start_str, "%H:%M").time()
            except (ValueError, TypeError):
                start_obj = now.time().replace(second=0, microsecond=0)
        else:
            start_obj = now.time().replace(second=0, microsecond=0)

        end_str = request.data.get("end_time")
        if end_str:
            try:
                end_obj = datetime.strptime(end_str, "%H:%M").time()
            except (ValueError, TypeError):
                end_obj = None
        else:
            end_obj = None

        if end_obj is None:
            end_dt = datetime.combine(date_obj, start_obj) + timedelta(hours=1)
            end_obj = end_dt.time()

        if end_obj <= start_obj:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "وقت النهاية يجب أن يكون بعد وقت البداية.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Resolve the teacher.
        teacher = user if user.role == User.Role.TEACHER else None
        if teacher is None:
            teacher_id = request.data.get("teacher")
            if teacher_id:
                teacher = (
                    User.objects.for_tenant(request.tenant)
                    .filter(id=teacher_id, role=User.Role.TEACHER)
                    .first()
                )
            if teacher is None:
                # Admin creating without specifying teacher: pick the first
                # teacher assigned to this group, or fall back to error.
                assignment = (
                    TeacherAssignment.objects.for_tenant(request.tenant)
                    .filter(
                        models.Q(groups=group)
                        | models.Q(groups__isnull=True, course__grade=group.grade)
                    )
                    .select_related("teacher")
                    .first()
                )
                if assignment is None:
                    return Response(
                        {
                            "error": {
                                "status": 400,
                                "detail": (
                                    "لا يوجد معلم مُعيَّن لهذه المجموعة. "
                                    "عيّن معلمًا أولًا أو اختر معلمًا يدويًا."
                                ),
                            }
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                teacher = assignment.teacher

        session = AttendanceSession.objects.create(
            tenant=request.tenant,
            group=group,
            teacher=teacher,
            date=date_obj,
            start_time=start_obj,
            end_time=end_obj,
            mode=request.data.get("mode", AttendanceSession.Mode.HYBRID),
            late_threshold_minutes=int(request.data.get("late_threshold_minutes", 15) or 15),
            created_by=user,
        )

        # Open immediately
        open_session(session, by_user=user)

        log_action(
            actor=user,
            tenant=request.tenant,
            action="attendance_session.quick_started",
            obj=session,
            metadata={"group": group.name, "date": str(date_obj)},
        )

        session.refresh_from_db()
        data = self.get_serializer(session).data
        data["created"] = True
        return Response(data, status=status.HTTP_201_CREATED)

    # ------------------------------------------------------------------
    # QR
    # ------------------------------------------------------------------

    @action(detail=True, methods=["get"], url_path="qr-token")
    def qr_token(self, request, pk=None):
        """Polled by the QR-display page every ~25s."""
        session = self.get_object()
        self._ensure_can_operate(session)
        return Response(current_qr_payload(session))

    # ------------------------------------------------------------------
    # Records listing (per session)
    # ------------------------------------------------------------------

    @action(detail=True, methods=["get"])
    def records(self, request, pk=None):
        """Live roster with each student's current status. Used by both
        the marking page and the read-only view for closed sessions."""
        session = self.get_object()
        rows = session.records.select_related("student").order_by(
            "student__first_name", "student__email"
        )
        if request.user.role == "STUDENT":
            own_rows = rows.filter(student=request.user)
            return Response(StudentAttendanceRecordSerializer(own_rows, many=True).data)
        if request.user.role in {"OWNER", "ADMIN", "TEACHER"}:
            return Response(AttendanceRecordSerializer(rows, many=True).data)
        return Response(
            {
                "error": {
                    "status": 403,
                    "detail": "غير مصرح بعرض سجلات حضور الجلسة.",
                }
            },
            status=403,
        )

    # ------------------------------------------------------------------
    # Manual + bulk marking
    # ------------------------------------------------------------------

    @action(detail=True, methods=["post"], url_path="mark-manual")
    def mark_manual(self, request, pk=None):
        session = self.get_object()
        self._ensure_can_operate(session)
        serializer = ManualMarkInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        student = (
            User.objects.for_tenant(request.tenant)
            .filter(
                id=serializer.validated_data["student"],
                role=User.Role.STUDENT,
            )
            .first()
        )
        if student is None:
            return Response(
                {"error": {"status": 404, "detail": "الطالب غير موجود."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        record = manual_mark(
            session=session,
            student=student,
            status=serializer.validated_data["status"],
            by_user=request.user,
            notes=serializer.validated_data.get("notes", ""),
        )
        return Response(AttendanceRecordSerializer(record).data)

    @action(detail=True, methods=["post"], url_path="mark-bulk")
    def mark_bulk(self, request, pk=None):
        """Set the same status for many students in one call. Useful for
        'everyone present' / 'mark all remaining absent'."""
        session = self.get_object()
        self._ensure_can_operate(session)
        serializer = BulkMarkInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from django.db import transaction

        student_ids = serializer.validated_data["students"]
        new_status = serializer.validated_data["status"]

        valid_students = User.objects.for_tenant(request.tenant).filter(
            id__in=student_ids, role=User.Role.STUDENT
        )
        students_by_id = {s.id: s for s in valid_students}

        updated = 0
        with transaction.atomic():
            for _sid, student_obj in students_by_id.items():
                manual_mark(
                    session=session,
                    student=student_obj,
                    status=new_status,
                    by_user=request.user,
                )
                updated += 1

        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="attendance_session.bulk_marked",
            obj=session,
            metadata={"count": updated, "status": new_status},
        )
        return Response({"updated": updated, "status": new_status})

    # ------------------------------------------------------------------
    # Scan card — teacher scans a student's barcode ID
    # ------------------------------------------------------------------

    @action(detail=True, methods=["post"], url_path="scan-card")
    def scan_card(self, request, pk=None):
        """POST /attendance/sessions/{id}/scan-card/  body: {student_code}

        Idempotent-friendly: a rescan returns the EXISTING record with
        `duplicate: true` instead of erroring. Real classes have students
        who scan twice by accident — the kiosk should acknowledge them
        with a distinct tone, not a red error.
        """
        session = self.get_object()
        self._ensure_can_operate(session)

        if session.status != AttendanceSession.Status.OPEN:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "الجلسة غير مفتوحة — لا يمكن تسجيل الحضور.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        code = (request.data.get("student_code") or "").strip()
        if not code:
            return Response(
                {"error": {"status": 400, "detail": "الكود مطلوب."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        student = (
            User.objects.for_tenant(request.tenant)
            .filter(student_code=code, role=User.Role.STUDENT)
            .first()
        )
        if student is None:
            return Response(
                {
                    "error": {
                        "status": 404,
                        "detail": f"لا يوجد طالب بالكود '{code}' في هذه المؤسسة.",
                    }
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        enrolled = (
            Enrollment.objects.for_tenant(request.tenant)
            .filter(
                student=student,
                group=session.group,
                status=Enrollment.Status.ACTIVE,
            )
            .exists()
        )
        if not enrolled:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": f"الطالب {student.email} غير مسجل في هذه المجموعة.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Idempotent rescan — return existing if already marked.
        existing = (
            AttendanceRecord.objects.for_tenant(request.tenant)
            .filter(session=session, student=student)
            .first()
        )

        if existing is not None and existing.status in (
            AttendanceRecord.Status.PRESENT,
            AttendanceRecord.Status.LATE,
            AttendanceRecord.Status.EXCUSED,
        ):
            full_name = f"{student.first_name} {student.last_name}".strip() or student.email
            return Response(
                {
                    "student_id": str(student.id),
                    "student_name": full_name,
                    "student_code": student.student_code,
                    "status": existing.status,
                    "check_in_at": existing.check_in_at,
                    "duplicate": True,
                },
                status=status.HTTP_200_OK,
            )

        # Fresh mark
        record = manual_mark(
            session=session,
            student=student,
            status=AttendanceRecord.Status.PRESENT,
            by_user=request.user,
            notes=f"Scanned barcode {code}",
        )

        # Recompute PRESENT vs LATE if the arrival is past the threshold.
        if record.status == AttendanceRecord.Status.PRESENT and record.check_in_at:
            if record.check_in_at > _effective_late_boundary(session):
                record.status = AttendanceRecord.Status.LATE
                record.save(update_fields=["status", "updated_at"])

        full_name = f"{student.first_name} {student.last_name}".strip() or student.email
        return Response(
            {
                "student_id": str(student.id),
                "student_name": full_name,
                "student_code": student.student_code,
                "status": record.status,
                "check_in_at": record.check_in_at,
                "duplicate": False,
            },
            status=status.HTTP_200_OK,
        )

    # ------------------------------------------------------------------
    # F-01 / F-06 — Today's sessions (from GroupSchedule)
    # ------------------------------------------------------------------

    @action(detail=False, methods=["get"])
    def today(self, request):
        """GET /attendance/sessions/today/ — schedules for today's weekday.

        F-01 FIX: `components/dashboard/TodaySessionsWidget.tsx` calls this
        endpoint for every non-student user. It didn't exist in the backend,
        producing a silent 404 that hid the whole widget.

        Batch 20 (Milestone 5): each row carries `starts_in_minutes`,
        `ready_to_start`, and `state` so the frontend can gate the "start"
        button properly. Batch 20.1 added the `"missed"` state for sessions
        that are >2h late — those cannot be started.

        Role scoping:
          - OWNER/ADMIN: every active schedule in the tenant
          - TEACHER:   only schedules for groups they're assigned to
          - STUDENT:   empty (no staff view of the schedule)
        """
        from django.db.models import Q
        from django.utils import timezone as dj_tz

        today_date = dj_tz.localdate()
        # Model convention: 0=Sunday..6=Saturday. Python's weekday() is
        # Mon=0..Sun=6. (d.weekday() + 1) % 7 maps Mon→1, Sun→0, Sat→6.
        weekday = (today_date.weekday() + 1) % 7

        qs = (
            GroupSchedule.objects.for_tenant(request.tenant)
            .filter(weekday=weekday, is_active=True)
            .select_related("group", "teacher")
        )

        user = request.user
        if user.role == User.Role.TEACHER:
            assignments = TeacherAssignment.objects.for_tenant(request.tenant).filter(teacher=user)
            narrowed = assignments.filter(groups__isnull=False).values_list("groups__id", flat=True)
            whole_grade = assignments.filter(groups__isnull=True).values_list(
                "course__grade_id", flat=True
            )
            qs = qs.filter(
                Q(teacher=user)
                | Q(group_id__in=list(narrowed))
                | Q(group__grade_id__in=list(whole_grade))
            ).distinct()
        elif user.role not in (User.Role.OWNER, User.Role.ADMIN):
            qs = qs.none()

        # Index today's existing sessions by group_id for O(1) lookup.
        existing_sessions = {
            s.group_id: s
            for s in AttendanceSession.objects.for_tenant(request.tenant).filter(date=today_date)
        }

        now_local = dj_tz.localtime()
        now_minutes = now_local.hour * 60 + now_local.minute

        payload = []
        for schedule in qs.order_by("start_time"):
            sess = existing_sessions.get(schedule.group_id)
            can_start = (sess is None) or sess.status in (
                AttendanceSession.Status.SCHEDULED,
                AttendanceSession.Status.CANCELLED,
            )

            start_minutes = schedule.start_time.hour * 60 + schedule.start_time.minute
            starts_in = start_minutes - now_minutes

            # Batch 20.1: 4-state classification.
            if starts_in > 30:
                state = "upcoming"
                ready_to_start = False
            elif starts_in < -120:
                state = "missed"
                ready_to_start = False
            elif starts_in < -10:
                state = "late"
                ready_to_start = False
            else:
                state = "ready"
                ready_to_start = True

            payload.append(
                {
                    "schedule_id": schedule.id,
                    "group_id": schedule.group_id,
                    "group_name": schedule.group.name,
                    "start_time": schedule.start_time.strftime("%H:%M"),
                    "end_time": schedule.end_time.strftime("%H:%M"),
                    "teacher_email": (schedule.teacher.email if schedule.teacher_id else None),
                    "session_id": sess.id if sess else None,
                    "session_status": sess.status if sess else None,
                    "can_start": can_start,
                    "starts_in_minutes": starts_in,
                    "ready_to_start": ready_to_start,
                    "state": state,
                }
            )

        return Response(TodaySessionSerializer(payload, many=True).data)

    @action(detail=False, methods=["post"], url_path="from-schedule")
    def from_schedule(self, request):
        """POST /attendance/sessions/from-schedule/ — body: {schedule: uuid}

        F-01 FIX: `startSessionFromSchedule()` in the frontend calls this
        endpoint to start a session with one click from the dashboard's
        Today widget.

        Batch 20 / 20.1 (Milestone 5):
          - A schedule that's >2h late is "missed" — hard reject, even
            with `force=true`. Use `quick-start` if the teacher actually
            held a class today.
          - A schedule that's 10min-2h late, or >30min early, requires
            `force=true` — the UI shows a confirm dialog with the exact
            time delta so the teacher knows what they're doing.
          - Otherwise (within ±10/+30min of start_time), starts directly.
        """
        from django.utils import timezone as dj_tz

        schedule_id = request.data.get("schedule")
        if not schedule_id:
            return Response(
                {"error": {"status": 400, "detail": "schedule مطلوب."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        schedule = (
            GroupSchedule.objects.for_tenant(request.tenant)
            .filter(id=schedule_id, is_active=True)
            .select_related("group", "teacher")
            .first()
        )
        if schedule is None:
            return Response(
                {
                    "error": {
                        "status": 404,
                        "detail": "لا توجد حصة مجدولة بهذا المعرّف.",
                    }
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        self._check_year_writable(instance=schedule)

        # ---- Batch 20.1: time-of-day gate ----
        force = str(request.data.get("force", "false")).lower() in (
            "true",
            "1",
            "yes",
        )
        now_local = dj_tz.localtime()
        now_minutes = now_local.hour * 60 + now_local.minute
        start_minutes = schedule.start_time.hour * 60 + schedule.start_time.minute
        delta = start_minutes - now_minutes

        # Hard reject: >2h late, even with force. A 9 AM class started at
        # 4 PM creates misleading attendance records. Use quick-start if
        # the teacher actually held a class.
        if delta < -120:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": (
                            f"فات موعد الحصة بأكثر من ساعتين (مجدولة "
                            f"{schedule.start_time.strftime('%H:%M')}). "
                            "لا يمكن بدء حصة فائتة. استخدم «بدء حصة الآن» "
                            "إذا كنت تريد تسجيل حضور حصة فعلية."
                        ),
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Soft gate: early or 10min-2h late needs explicit force.
        if not force:
            if delta > 30:
                return Response(
                    {
                        "error": {
                            "status": 400,
                            "detail": (
                                f"الحصة مجدولة الساعة "
                                f"{schedule.start_time.strftime('%H:%M')} — "
                                f"لم يحن موعدها بعد (بعد {delta // 60} ساعة "
                                f"و {delta % 60} دقيقة). "
                                "استخدم force=true للبدء مبكرًا."
                            ),
                        }
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if delta < -10:
                return Response(
                    {
                        "error": {
                            "status": 400,
                            "detail": (
                                f"الحصة كان المفروض تبدأ الساعة "
                                f"{schedule.start_time.strftime('%H:%M')} — "
                                f"فات موعدها بـ {abs(delta)} دقيقة. "
                                "استخدم force=true للبدء متأخرًا."
                            ),
                        }
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        today_date = dj_tz.localdate()

        # Resume: if a session for this group today already exists, return it.
        existing = (
            AttendanceSession.objects.for_tenant(request.tenant)
            .filter(group=schedule.group, date=today_date)
            .first()
        )
        if existing is not None:
            data = self.get_serializer(existing).data
            data["created"] = False
            return Response(data, status=status.HTTP_200_OK)

        user = request.user

        # Teachers can only start sessions for groups they manage.
        if user.role == User.Role.TEACHER:
            if not teacher_can_manage_group(user, schedule.group):
                raise PermissionDenied("لا يمكنك بدء حصة لمجموعة خارج نطاق تكليفاتك.")

        # Resolve teacher: schedule.teacher → caller (if teacher) → any
        # assigned teacher → error.
        teacher = schedule.teacher
        if teacher is None and user.role == User.Role.TEACHER:
            teacher = user
        if teacher is None:
            assignment = (
                TeacherAssignment.objects.for_tenant(request.tenant)
                .filter(
                    models.Q(groups=schedule.group)
                    | models.Q(groups__isnull=True, course__grade=schedule.group.grade)
                )
                .select_related("teacher")
                .first()
            )
            if assignment is None:
                return Response(
                    {
                        "error": {
                            "status": 400,
                            "detail": (
                                "لا يوجد معلم معيّن لهذه المجموعة. عيّن معلمًا "
                                "أولًا أو ابدأ الحصة كمسؤول."
                            ),
                        }
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            teacher = assignment.teacher

        session = AttendanceSession.objects.create(
            tenant=request.tenant,
            group=schedule.group,
            teacher=teacher,
            date=today_date,
            start_time=schedule.start_time,
            end_time=schedule.end_time,
            mode=AttendanceSession.Mode.HYBRID,
            created_by=user,
        )
        open_session(session, by_user=user)

        log_action(
            actor=user,
            tenant=request.tenant,
            action="attendance_session.started_from_schedule",
            obj=session,
            metadata={
                "schedule_id": str(schedule.id),
                "group": schedule.group.name,
                "forced": force,  # Batch 20.1: audit whether this was forced
            },
        )

        session.refresh_from_db()
        data = self.get_serializer(session).data
        data["created"] = True
        return Response(data, status=status.HTTP_201_CREATED)

    # ------------------------------------------------------------------
    # F-02 — Manual absence notification trigger
    # ------------------------------------------------------------------

    @action(detail=True, methods=["post"], url_path="notify-parents")
    def notify_parents(self, request, pk=None):
        """POST /attendance/sessions/<id>/notify-parents/ — body: {force?}.

        F-02 FIX: the `send_absence_notifications` service was implemented
        but had no manual trigger. This endpoint lets a teacher re-send
        notifications for a session, either to parents who haven't been
        notified yet (default) or to everyone (force=true — useful after
        a parent claims they didn't receive the email).

        Auto-dispatch also happens on session close (see `close_session`
        in services.py).
        """
        from .services import send_absence_notifications

        session = self.get_object()
        self._ensure_can_operate(session)

        if session.status == AttendanceSession.Status.SCHEDULED:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "الجلسة لم تُفتح بعد — لا يوجد حضور لإشعار أولياء الأمور.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        input_ser = NotifyParentsInputSerializer(data=request.data)
        input_ser.is_valid(raise_exception=True)
        force = input_ser.validated_data["force"]

        result = send_absence_notifications(session, skip_already_notified=not force)

        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="attendance_session.notify_parents_manual",
            obj=session,
            metadata={"force": force, **result},
        )

        return Response(result, status=status.HTTP_200_OK)


class GroupScheduleViewSet(YearAwareViewSet):
    """CRUD for weekly group schedules.

    F-06 FIX: GroupSchedule had a model + admin registration but no API
    at all — the "Today's Sessions" widget (F-01) requires schedules to
    exist, and admins could only create them through Django admin. This
    viewset fixes that.

    Permissions:
      - Read: any staff member (OWNER/ADMIN/TEACHER)
      - Write: OWNER/ADMIN only (schedule configuration is an admin task)

    Filters:
      - ?group=<uuid>       — narrow to one group
      - ?teacher=<uuid>     — narrow to one teacher
      - ?weekday=0..6       — filter by day
      - ?is_active=true/false
    """

    queryset = GroupSchedule.objects.all()
    serializer_class = GroupScheduleSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [
        IsStaffForWriteActions,
        IsAdminForWriteActions,
    ]
    filterset_fields = ["group", "teacher", "weekday", "is_active"]
    ordering_fields = ["weekday", "start_time", "created_at"]
    ordering = ["weekday", "start_time"]

    def perform_create(self, serializer):
        super().perform_create(serializer)
        log_action(
            actor=self.request.user,
            tenant=self.request.tenant,
            action="group_schedule.created",
            obj=serializer.instance,
            metadata={
                "group": serializer.instance.group.name,
                "weekday": serializer.instance.weekday,
            },
        )

    def perform_update(self, serializer):
        super().perform_update(serializer)
        log_action(
            actor=self.request.user,
            tenant=self.request.tenant,
            action="group_schedule.updated",
            obj=serializer.instance,
        )

    def perform_destroy(self, instance):
        log_action(
            actor=self.request.user,
            tenant=self.request.tenant,
            action="group_schedule.deleted",
            obj=instance,
        )
        super().perform_destroy(instance)


class MarkQRView(TenantContextMixin, APIView):
    """POST /attendance/mark-qr/ — student scans the QR."""

    permission_classes = [IsAuthenticated, IsTenantMember, HasRole("STUDENT")]

    def post(self, request):
        serializer = MarkQRInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        session = (
            AttendanceSession.objects.for_tenant(request.tenant)
            .filter(id=serializer.validated_data["session"])
            .first()
        )
        if session is None:
            return Response(
                {"error": {"status": 404, "detail": "الجلسة غير موجودة."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        record = mark_via_qr(
            session=session,
            student=request.user,
            token=serializer.validated_data["token"],
            request=request,
        )
        return Response(
            AttendanceRecordSerializer(record).data,
            status=status.HTTP_201_CREATED,
        )


class LookupStudentByCodeView(TenantContextMixin, APIView):
    """POST /attendance/lookup-by-code/  body: {student_code}

    Scanner setup test — verifies a scanner is producing the correct
    barcode value WITHOUT needing an active session. Used by
    /attendance/scanner-setup page.

    Returns diagnostic info even when found: received_code, code_length,
    has_whitespace. These help detect common scanner config problems
    (extra prefix/suffix characters, trailing newlines, etc.).
    """

    permission_classes = [
        IsAuthenticated,
        IsTenantMember,
        IsStaffForWriteActions,
    ]

    def post(self, request):
        code = (request.data.get("student_code") or "").strip()
        if not code:
            return Response(
                {"error": {"status": 400, "detail": "الكود مطلوب."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        student = (
            User.objects.for_tenant(request.tenant)
            .filter(student_code=code, role=User.Role.STUDENT)
            .first()
        )

        base = {
            "received_code": code,
            "code_length": len(code),
            "has_whitespace": any(c.isspace() for c in code),
        }

        if student is None:
            return Response(
                {
                    **base,
                    "found": False,
                    "hint": (
                        "لا يوجد طالب بهذا الكود. تحقق من إعدادات الماسح أو جرّب مسح بطاقة أخرى."
                    ),
                }
            )

        return Response(
            {
                **base,
                "found": True,
                "student": {
                    "id": str(student.id),
                    "name": (f"{student.first_name} {student.last_name}".strip() or student.email),
                    "email": student.email,
                },
            }
        )
