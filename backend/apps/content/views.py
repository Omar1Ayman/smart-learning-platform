from django.db import transaction
from django.db.models.deletion import ProtectedError, RestrictedError
from django.http import FileResponse, Http404
from django.utils.cache import patch_cache_control
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import User
from apps.audit.services import log_action
from apps.common.permissions import IsStaffForWriteActions, IsTenantMember
from apps.common.views import TenantScopedViewSet, YearAwareViewSet
from apps.tenants.permissions import user_can

from .filters import ContentFilter
from .models import Content
from .serializers import ContentSerializer
from .services import visible_content_for_student


class ContentViewSet(YearAwareViewSet):
    """Content library.

    Write permissions have a tenant-policy layer on top of role:
    - OWNER/ADMIN: any content in the tenant
    - TEACHER: their own content when `teachers_can_manage_own_content`
      is enabled; editing and deleting others' content have separate
      policy checks.
    - STUDENT: read-only, filtered by visibility service

    Every write is audit-logged (Wave 13 contract) — a policy change
    that lets teachers edit each other's content makes the audit trail
    even more valuable, not less.

    Wave D0b — server-side search / sort / filters. Overrides
    `bulk_delete` to enforce per-item `_can_edit()` (the base class
    implementation calls `obj.delete()` directly, bypassing
    `perform_destroy` — a real authorization gap for this viewset
    where write access is object-level, not just role-level).
    """

    queryset = Content.objects.all()
    serializer_class = ContentSerializer

    # ── Filter / search / sort ──
    # filterset_class drives filtering; search_fields + ordering_fields
    # require DjangoFilterBackend + SearchFilter + OrderingFilter in
    # REST_FRAMEWORK["DEFAULT_FILTER_BACKENDS"].
    filterset_class = ContentFilter
    search_fields = ["title", "description", "text_body"]
    ordering_fields = ["title", "created_at", "updated_at", "is_published"]
    ordering = ["-created_at"]

    # ── Permissions ──
    # IsStaffForWriteActions blocks STUDENT from any non-safe method.
    # Object-level write check (_can_edit) still applies on top for
    # TEACHER-vs-TEACHER boundaries.
    permission_classes = [
        *TenantScopedViewSet.permission_classes,
        IsStaffForWriteActions,
    ]

    def get_queryset(self):
        if self.request.user.role == User.Role.STUDENT:
            return visible_content_for_student(self.request.tenant, self.request.user)
        return super().get_queryset()

    def _can_edit(self, obj, action="edit") -> bool:
        """Tenant-policy-aware write check.

        Replaces IsCreatorOrAdmin on this view because the "can I touch
        someone else's row" answer now depends on the tenant setting.
        """
        user = self.request.user
        if user.role in (User.Role.OWNER, User.Role.ADMIN):
            return True
        if user.role == User.Role.TEACHER:
            if obj.created_by_id == user.id:
                return user_can(user, "teachers_can_manage_own_content")
            if action == "delete":
                return user_can(user, "teachers_can_delete_others_content")
            policy = self.request.tenant.get_policy("content_policy")
            return bool(policy.get("teachers_can_edit_others_content", False))
        return False

    def _check_teacher_publish(self, validated_data, instance=None):
        if self.request.user.role != User.Role.TEACHER:
            return
        is_published = validated_data.get(
            "is_published", getattr(instance, "is_published", False)
        )
        was_published = bool(instance and instance.is_published)
        if is_published and not was_published and not user_can(
            self.request.user, "teachers_can_publish_content_directly"
        ):
            raise PermissionDenied("نشر المحتوى مباشرة غير مسموح لك حسب إعدادات المؤسسة.")

    def perform_create(self, serializer):
        if self.request.user.role == User.Role.TEACHER and not user_can(
            self.request.user, "teachers_can_manage_own_content"
        ):
            raise PermissionDenied("إضافة المحتوى غير مسموحة لك حسب إعدادات المؤسسة.")
        self._check_teacher_publish(serializer.validated_data)
        super().perform_create(serializer)
        log_action(
            actor=self.request.user,
            tenant=self.request.tenant,
            action="content.created",
            obj=serializer.instance,
            metadata={"content_type": serializer.instance.content_type},
        )

    def perform_update(self, serializer):
        if not self._can_edit(serializer.instance):
            raise PermissionDenied("لا يمكنك تعديل محتوى أنشأه شخص آخر.")
        self._check_teacher_publish(serializer.validated_data, serializer.instance)
        super().perform_update(serializer)
        log_action(
            actor=self.request.user,
            tenant=self.request.tenant,
            action="content.updated",
            obj=serializer.instance,
        )

    def perform_destroy(self, instance):
        if not self._can_edit(instance, action="delete"):
            raise PermissionDenied("لا يمكنك حذف محتوى أنشأه شخص آخر.")
        # Capture before delete — the object won't be readable after.
        snapshot = {
            "title": instance.title,
            "content_type": instance.content_type,
        }
        log_action(
            actor=self.request.user,
            tenant=self.request.tenant,
            action="content.deleted",
            obj=instance,
            metadata=snapshot,
        )
        super().perform_destroy(instance)

    # ====================================================================
    # Wave D0b — bulk delete with per-item _can_edit()
    # ====================================================================

    @action(
        detail=False,
        methods=["post"],
        url_path="bulk_delete",
        permission_classes=[IsAuthenticated, IsTenantMember, IsStaffForWriteActions],
    )
    def bulk_delete(self, request):
        """POST /content/bulk_delete/  body: {ids: [...]}

        Enforces TWO layers:
          1. IsStaffForWriteActions — blocks STUDENT outright.
          2. `_can_edit(obj)` per-item — a TEACHER without
             `teachers_can_delete_others_content` cannot delete someone
             else's content, even inside a batch.

        All-or-nothing: any unauthorized or protected item aborts the
        entire batch (transactional) so the UI's single confirm dialog
        maps to a single coherent outcome.
        """
        ids = request.data.get("ids")
        if not isinstance(ids, list) or not ids:
            return Response(
                {"error": {"status": 400, "detail": "يجب اختيار عنصر واحد على الأقل."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(ids) > 200:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "الحد الأقصى 200 عنصر في الدفعة الواحدة.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = list(self.get_queryset().filter(id__in=ids))
        found_ids = {str(obj.id) for obj in qs}
        missing = [str(i) for i in ids if str(i) not in found_ids]

        # Wave D0b security gate — verify authorization BEFORE any write.
        unauthorized = [obj for obj in qs if not self._can_edit(obj, action="delete")]
        if unauthorized:
            return Response(
                {
                    "error": {
                        "status": 403,
                        "detail": (
                            f"لا يمكنك حذف {len(unauthorized)} عنصر — "
                            "ليس لديك صلاحية عليها."
                        ),
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        blocked: list[dict] = []
        try:
            with transaction.atomic():
                for obj in qs:
                    try:
                        obj.delete()
                    except (RestrictedError, ProtectedError):
                        blocked.append({"id": str(obj.id), "label": str(obj)})
                        raise
        except (RestrictedError, ProtectedError):
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": (
                            f"لا يمكن حذف {len(blocked)} عنصر — توجد بيانات "
                            "مرتبطة به. لم يُحذف أي شيء من الدفعة."
                        ),
                        "blocked": blocked,
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="content.bulk_deleted",
            metadata={"count": len(found_ids), "ids": sorted(found_ids)},
        )

        return Response(
            {
                "deleted": sorted(found_ids),
                "missing": missing,
            },
            status=status.HTTP_200_OK,
        )

    # ====================================================================
    # Download
    # ====================================================================

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        """The only sanctioned way to read a Content row's payload.

        STUDENT access goes through `get_queryset()` which is filtered
        by `visible_content_for_student` — an out-of-scope student gets
        404 from `get_object()` before we serve anything.

        M8 fix: `storage.exists()` followed by `.open()` is a TOCTOU —
        a file deleted between the two calls (rare but possible) raised
        FileNotFoundError → 500. We now catch it from `.open()` directly
        and return 404.
        """
        content = self.get_object()

        if content.file:
            try:
                file_handle = content.file.open("rb")
            except (FileNotFoundError, OSError):
                raise Http404("الملف غير موجود.")
            return FileResponse(
                file_handle,
                as_attachment=True,
                filename=content.original_filename or content.file.name,
            )
        if content.external_url:
            return Response({"external_url": content.external_url})
        return Response({"text_body": content.text_body})

    @action(detail=True, methods=["get"])
    def preview(self, request, pk=None):
        """GET /content/<id>/preview/ — inline image for thumbnails.

        Distinct from `download` in two ways:
          - Served inline (Content-Disposition: inline), not as attachment
          - Only works for IMAGE content with an actual file

        Permission chain is the SAME as download: `get_object()` runs
        `get_queryset()`, which applies `visible_content_for_student()`
        for STUDENT — an out-of-scope student gets 404 before any bytes
        are served. A staff member with `teachers_can_edit_others_content`
        off can still VIEW every image in the tenant (read vs write are
        different permissions); that matches `download`'s behavior.
        """
        content = self.get_object()

        if content.content_type != Content.ContentType.IMAGE or not content.file:
            raise Http404("لا توجد معاينة لهذا العنصر.")

                # M8 fix: TOCTOU-safe open. See download() for rationale.
        try:
            file_handle = content.file.open("rb")
        except (FileNotFoundError, OSError):
            raise Http404("الملف غير موجود.")

        # Derive the HTTP Content-Type from the stored extension.
        ext = content.file.name.rsplit(".", 1)[-1].lower()
        ct_map = {
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "webp": "image/webp",
            "gif": "image/gif",
        }
        content_type = ct_map.get(ext, "application/octet-stream")

        response = FileResponse(file_handle, content_type=content_type)
        patch_cache_control(response, private=True, max_age=300)
        return response