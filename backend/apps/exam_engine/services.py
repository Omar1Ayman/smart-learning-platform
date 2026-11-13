"""
Phase 9 — Exam engine services (Wave 9B).

Everything business-critical about taking an exam lives here, not in the
views: eligibility checks, question selection, timer computation, answer
saving, auto-grading. Views are thin — they call into this module and
serialize the result.

Design notes:

- **Randomization is snapshotted once at start.** `randomize_question_order`
  / `randomize_option_order` on the assessment are honored exactly once,
  when the attempt is created. The result is stored on the attempt itself
  (question_order / option_order JSON). A student who refreshes sees the
  same order they saw a moment ago — critical for a fair exam experience.

- **Timers are server-side.** `expires_at` is computed from
  `duration_minutes` (or the effective window's closes_at, whichever is
  sooner). The frontend can display a countdown, but the authoritative
  deadline is always server time.

- **Grading is deterministic for MCQ / TRUE_FALSE / SHORT_ANSWER.**
  ESSAY stays `is_correct=None` until manually graded; the attempt's
  status is SUBMITTED (not GRADED) in that case, so a report can
  distinguish "partial score" from "final".

- **Wave Zero fixes:**
  - **C-4:** an attempt that expired used to transition to EXPIRED and
    lose its answers — the student could no longer submit, and the score
    was never computed. `_finalize_expired_attempt` now auto-grades any
    answers already saved, so the student retains partial credit and
    gets a result page. `submit_attempt` accepts `EXPIRED` as an
    in-flight status so the transition doesn't fail.
  - **C-5:** two concurrent `start_attempt` calls (double-click,
    duplicate tab, network retry) used to hit
    `uniq_attempt_number_per_student_assessment` and surface as a raw
    500. The create is now wrapped in an inner savepoint; on
    IntegrityError we return the already-existing IN_PROGRESS attempt.

- **Post-review fixes:**
  - `_compute_expires_at` now takes `(started_at, duration_minutes,
    closes_at)` and honors the effective window's `closes_at`
    (from `resolve_effective_window`), not just `assessment.ends_at`.
  - `attempt_number` is computed from `MAX(attempt_number) + 1`, not
    `used + 1`, so VOIDED attempts (which don't count towards `used`)
    don't cause a unique-constraint collision on retry.
  - `reopen_attempt` caps the new `expires_at` at the effective window's
    `closes_at` when the window is still OPEN.
  - `submit_attempt` is wrapped in `transaction.atomic()` for the
    grading phase so a mid-loop failure cannot leave partially-graded
    answers committed.
"""

import logging
import secrets
from datetime import timedelta
from decimal import Decimal

logger = logging.getLogger(__name__)

from django.db import IntegrityError, transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.assessments.models import Assessment, AssessmentQuestion
from apps.assessments.services import resolve_effective_window
from apps.notifications.services import notify
from apps.questions.models import Question

from .models import AttemptAnswer, ExamAttempt


# ============================================================================
# Start / resume
# ============================================================================

def start_attempt(assessment, student, tenant):
    """Create (or resume) an ExamAttempt for this student on this assessment.

    Respects the tenant's exam policy:
    - `allow_retakes = False` → only one attempt is ever allowed, even if
      the assessment's own max_attempts is higher.
    """
    now = timezone.now()
    exam_policy = tenant.get_policy("exam_policy")
    allow_retakes = exam_policy.get("allow_retakes", True)

    if assessment.status != Assessment.Status.PUBLISHED:
        raise ValidationError("هذا الامتحان غير متاح حاليًا.")

    window = resolve_effective_window(assessment, student, now=now)
    if not window["can_start"]:
        raise ValidationError(window["reason"])

    # Resume an in-progress attempt if one exists.
    existing = (
        ExamAttempt.objects.for_tenant(tenant)
        .filter(
            student=student,
            assessment=assessment,
            status=ExamAttempt.Status.IN_PROGRESS,
        )
        .first()
    )
    if existing is not None:
        if not existing.is_expired(now):
            return existing
        # C-4 FIX: don't just mark EXPIRED — grade what's already saved so
        # the student keeps partial credit and can see their result.
        _finalize_expired_attempt(existing)
        # Fall through: the student may still be within their max_attempts
        # and eligible to start a fresh attempt right away.

    # Policy: retake check. VOIDED attempts deliberately don't count here —
    # a voided attempt is an escape hatch (technical failure, proven cheat)
    # that should NOT consume a retry.
    consumed_statuses = [
        ExamAttempt.Status.SUBMITTED,
        ExamAttempt.Status.GRADED,
        ExamAttempt.Status.EXPIRED,
    ]
    used = (
        ExamAttempt.objects.for_tenant(tenant)
        .filter(
            student=student,
            assessment=assessment,
            status__in=consumed_statuses,
        )
        .count()
    )

    if not allow_retakes and used >= 1:
        raise ValidationError("هذا الامتحان لا يسمح بإعادة المحاولة.")

    if assessment.max_attempts and used >= assessment.max_attempts:
        raise ValidationError("لقد استنفدت عدد المحاولات المتاحة لهذا الامتحان.")

    # Post-review fix: attempt_number must be MAX + 1 over ALL attempts
    # (including VOIDED), not used + 1 — otherwise VOIDED rows collide on
    # the unique constraint when the student retries.
    last_number = (
        ExamAttempt.objects.for_tenant(tenant)
        .filter(student=student, assessment=assessment)
        .aggregate(m=Max("attempt_number"))["m"]
        or 0
    )
    next_number = last_number + 1

    question_ids = _select_question_ids(assessment)
    if not question_ids:
        raise ValidationError("الامتحان لا يحتوي على أسئلة.")

    option_order = _build_option_order(assessment, question_ids)
    max_score = _compute_max_score(assessment, question_ids)
    if max_score <= 0:
        raise ValidationError(
            "هذا الامتحان غير صالح — مجموع نقاط الأسئلة صفر. تواصل مع المعلم."
        )

    # Post-review fix: honor the *effective* window's closes_at, not just
    # assessment.ends_at. A target override may close the exam much sooner
    # than the assessment-wide ends_at.
    expires_at = _compute_expires_at(
        started_at=now,
        duration_minutes=assessment.duration_minutes,
        closes_at=window["closes_at"],
    )

    # C-5 FIX: two simultaneous start_attempt calls (double-click, page
    # reload during a network retry, duplicate tab) both pass the "no
    # existing attempt" check and race to create attempt_number=N+1. The
    # loser hits IntegrityError on uniq_attempt_number_per_student_assessment
    # and surfaces as a raw 500. Wrap the create in an inner savepoint;
    # on collision we return the winner's attempt.
    try:
        with transaction.atomic():  # inner savepoint
            return ExamAttempt.objects.create(
                tenant=tenant,
                assessment=assessment,
                student=student,
                attempt_number=next_number,
                question_order=question_ids,
                option_order=option_order,
                max_score=max_score,
                expires_at=expires_at,
            )
    except IntegrityError:
        # Another request won the race. Return the attempt that won, if
        # it's still IN_PROGRESS (which is almost always the case — the
        # race window is milliseconds).
        winner = (
            ExamAttempt.objects.for_tenant(tenant)
            .filter(
                student=student,
                assessment=assessment,
                status=ExamAttempt.Status.IN_PROGRESS,
            )
            .order_by("-started_at")
            .first()
        )
        if winner is not None:
            return winner
        # Extremely unlikely: the winner already submitted in the interim.
        # Re-raise rather than loop — this deserves operator attention.
        raise


# ============================================================================
# Answer saving (autosave endpoint)
# ============================================================================

def save_answer(attempt, question_id, chosen_option_id=None, text_answer=""):
    """Upsert one answer. Called per-question from the exam UI (autosave).

    Validation is strict on purpose: a wrong question_id or a chosen_option
    that doesn't belong to the question is a client bug (or an attacker),
    not a user mistake — reject rather than silently drop.

    C-4 FIX: previously, an expired IN_PROGRESS attempt was transitioned
    to EXPIRED here with no grading, so the student lost every answer.
    Now we auto-finalize (grading what's saved) before raising.
    """
    if attempt.status == ExamAttempt.Status.EXPIRED:
        # Already closed by a previous expiry path.
        raise ValidationError("انتهى وقت الامتحان.")

    if attempt.status != ExamAttempt.Status.IN_PROGRESS:
        raise ValidationError("لا يمكن تعديل إجابات محاولة غير قيد التنفيذ.")

    if attempt.is_expired():
        # Timer has passed but the attempt is still IN_PROGRESS. Auto-grade
        # before telling the client it's over, so nothing is lost.
        _finalize_expired_attempt(attempt)
        raise ValidationError("انتهى وقت الامتحان. تم تسليم المحاولة تلقائيًا.")

    question_id = str(question_id)
    if question_id not in (attempt.question_order or []):
        raise ValidationError("هذا السؤال ليس ضمن هذا الامتحان.")

    question = Question.objects.for_tenant(attempt.tenant).get(id=question_id)

    chosen_option = None
    if question.question_type in (
        Question.QuestionType.MCQ,
        Question.QuestionType.TRUE_FALSE,
    ):
        if not chosen_option_id:
            raise ValidationError("يجب اختيار إجابة لهذا السؤال.")
        chosen_option = question.options.filter(id=chosen_option_id).first()
        if chosen_option is None:
            raise ValidationError("الاختيار المحدد لا ينتمي لهذا السؤال.")
    elif question.question_type in (
        Question.QuestionType.SHORT_ANSWER,
        Question.QuestionType.ESSAY,
    ):
        text_answer = (text_answer or "").strip()
        if (
            not text_answer
            and question.question_type == Question.QuestionType.SHORT_ANSWER
        ):
            raise ValidationError("الإجابة النصية مطلوبة.")
        chosen_option = None

    answer, _ = AttemptAnswer.objects.update_or_create(
        tenant=attempt.tenant,
        attempt=attempt,
        question=question,
        defaults={
            "chosen_option": chosen_option,
            "text_answer": text_answer,
            "is_correct": None,
            "awarded_points": None,
            "graded_at": None,
            "graded_by": None,
        },
    )
    return answer


# ============================================================================
# Submit / grade
# ============================================================================

def _compute_expires_at(started_at, duration_minutes, closes_at):
    """Whichever is sooner: start + duration, or closes_at.

    Both inputs nullable. `closes_at` is the effective close from
    resolve_effective_window — may be assessment.ends_at OR a target
    override, whichever applies to this student.
    """
    candidates = []
    if duration_minutes:
        candidates.append(started_at + timedelta(minutes=duration_minutes))
    if closes_at:
        candidates.append(closes_at)
    return min(candidates) if candidates else None


def submit_attempt(attempt, expired_notification=False):
    """Grade every answer that can be graded, then close the attempt.

    MCQ / TRUE_FALSE: chosen_option.is_correct.
    SHORT_ANSWER: exact-match against any accepted_answers entry
      (case-insensitive, whitespace-trimmed on both sides).
    ESSAY: stays None (pending). If any answer is pending, the attempt
      is SUBMITTED, not GRADED.

    Args:
        attempt: the ExamAttempt to grade and close.
        expired_notification (M7): controls ONLY the wording of the
            student/teacher notification messages ("انتهى الوقت
            تلقائيًا"). It has NO effect on grading logic, status
            transitions, or score calculation. Renamed from the
            misleading `expired=` — a caller could read the old name and
            assume it forced a specific transition.
    """
    if attempt.status not in (
        ExamAttempt.Status.IN_PROGRESS,
        ExamAttempt.Status.EXPIRED,
    ):
        raise ValidationError("لا يمكن تسليم محاولة ليست قيد التنفيذ.")

    now = timezone.now()

    # Grading phase — atomic.
    with transaction.atomic():
        links = {
            str(link.question_id): link
            for link in AssessmentQuestion.objects.filter(
                assessment=attempt.assessment,
                question_id__in=attempt.question_order or [],
            ).select_related("question")
        }

        pending_essay = False
        total_awarded = Decimal("0")

        for answer in attempt.answers.select_related("question", "chosen_option"):
            link = links.get(str(answer.question_id))
            if link is None:
                continue
            points = (
                link.points_override
                if link.points_override is not None
                else link.question.points
            )
            is_correct, awarded = _grade_one(answer, points)
            if is_correct is None:
                pending_essay = True
            else:
                total_awarded += awarded
            answer.is_correct = is_correct
            answer.awarded_points = awarded if is_correct is not None else None
            answer.graded_at = now
            answer.save(
                update_fields=[
                    "is_correct",
                    "awarded_points",
                    "graded_at",
                    "updated_at",
                ]
            )

        attempt.score = total_awarded
        attempt.submitted_at = now
        if pending_essay:
            attempt.status = ExamAttempt.Status.SUBMITTED
            attempt.is_passed = None
        else:
            attempt.status = ExamAttempt.Status.GRADED
            attempt.graded_at = now
            attempt.is_passed = attempt.compute_is_passed()

        update_fields = ["score", "submitted_at", "status", "is_passed", "updated_at"]
        if attempt.status == ExamAttempt.Status.GRADED:
            update_fields.append("graded_at")
        attempt.save(update_fields=update_fields)

    # Notifications — outside the transaction so a notify failure can't
    # roll back a successful grading.
    author = attempt.assessment.created_by
    if author is not None and author.id != attempt.student_id:
        notify(
            author,
            notif_type="EXAM_SUBMITTED",
            title=f"محاولة جديدة: {attempt.assessment.title}",
            message=(
                    f"{attempt.student.email} سلّم محاولته."
                    + (" (انتهى الوقت تلقائيًا)." if expired_notification else "")   # ⬅️ مصحّح
                    + (
                        ""
                        if attempt.status == ExamAttempt.Status.GRADED
                        else " بحاجة لتصحيح يدوي."
                    )
                ),
            link=f"/assessments/{attempt.assessment_id}/results",
        )

    if attempt.status == ExamAttempt.Status.GRADED:
        notify(
            attempt.student,
            notif_type="EXAM_GRADED",
            title=f"نتيجتك جاهزة: {attempt.assessment.title}",
            message=(
                    f"درجتك: {attempt.score} / {attempt.max_score} "
                    f"({round(attempt.percentage, 1)}%)."
                    + (" (تم التسليم تلقائيًا لانتهاء الوقت)." if expired_notification else "")   # ⬅️ مصحّح
                ),
            link=f"/results/{attempt.id}",
        )

    return attempt


# ============================================================================
# Internal helpers
# ============================================================================

def _finalize_expired_attempt(attempt):
    """C-4: safely grade an expired attempt without letting a grading
    failure leave it stuck in IN_PROGRESS forever.

    M1 fix (Wave Zero follow-up): the previous version swallowed the
    failure class AND re-raised the original exception, which meant:
      - the student saw a 500 ("Internal Server Error") instead of the
        intended "انتهى وقت الامتحان" message,
      - no log entry was written, so operators had no signal that a
        student's partial credit was lost.

    Now:
      - On success → submit_attempt grades and closes; nothing else to do.
      - On failure → log loudly with `logger.exception()` (visible in
        monitoring) and fall back to EXPIRED. The caller (save_answer /
        start_attempt) proceeds normally, so the user still gets the
        "exam ended" message. The student's saved answers remain in
        AttemptAnswer rows, recoverable by staff for manual grading.
    """
    try:
        submit_attempt(attempt, expired_notification=True)
        return
    except Exception:
        logger.exception(
            "Auto-finalize of expired attempt %s failed; falling back to "
            "EXPIRED without grading. Student's partial answers are "
            "preserved but unscored. Manual grading may be required.",
            attempt.id,
        )

    attempt.status = ExamAttempt.Status.EXPIRED
    attempt.save(update_fields=["status", "updated_at"])
def _select_question_ids(assessment):
    """Return the ordered list of question IDs to serve.

    Honors `question_count` (truncate) and `randomize_question_order`
    (shuffle). Randomization is sample-without-replacement when
    truncating, shuffle-in-place otherwise.
    """
    links = list(
        AssessmentQuestion.objects.filter(assessment=assessment).order_by("order")
    )
    ids = [str(link.question_id) for link in links]
    if not ids:
        return []

    if assessment.question_count and assessment.question_count < len(ids):
        if assessment.randomize_question_order:
            ids = secrets.sample(ids, assessment.question_count)
        else:
            ids = ids[: assessment.question_count]
    elif assessment.randomize_question_order:
        secrets.shuffle(ids)
    return ids


def _build_option_order(assessment, question_ids):
    """Return {question_id: [option_id, ...]} if option randomization is
    on; empty dict otherwise (serializer falls back to model ordering)."""
    if not assessment.randomize_option_order:
        return {}
    result = {}
    for link in AssessmentQuestion.objects.filter(
        assessment=assessment, question_id__in=question_ids
    ).prefetch_related("question__options"):
        option_ids = [str(o.id) for o in link.question.options.all()]
        secrets.shuffle(option_ids)
        result[str(link.question_id)] = option_ids
    return result


def _compute_max_score(assessment, question_ids):
    total = Decimal("0")
    for link in AssessmentQuestion.objects.filter(
        assessment=assessment, question_id__in=question_ids
    ).select_related("question"):
        total += (
            link.points_override
            if link.points_override is not None
            else link.question.points
        )
    return total


def _grade_one(answer, points):
    """Returns (is_correct|None, awarded_points).

    None for is_correct means "cannot auto-grade" (ESSAY).
    """
    q_type = answer.question.question_type

    if q_type in (Question.QuestionType.MCQ, Question.QuestionType.TRUE_FALSE):
        if answer.chosen_option is None:
            return (False, Decimal("0"))
        correct = answer.chosen_option.is_correct
        return (correct, points if correct else Decimal("0"))

    if q_type == Question.QuestionType.SHORT_ANSWER:
        accepted = answer.question.accepted_answers or []
        normalized = (answer.text_answer or "").strip().casefold()
        for candidate in accepted:
            if normalized and normalized == str(candidate).strip().casefold():
                return (True, points)
        return (False, Decimal("0"))

    # ESSAY — manual grading required.
    return (None, Decimal("0"))


# ============================================================================
# Manual grading
# ============================================================================

def grade_essay_answer(attempt, question_id, awarded_points, is_correct, graded_by):
    """Grade a single ESSAY answer (staff-only).

    Clamps `awarded_points` to [0, max] rather than rejecting — a grade
    that's 0.01 over a rounding boundary is a UX problem, not a security
    one; capping is more forgiving and produces the same intent.
    """
    if attempt.status not in (
        ExamAttempt.Status.SUBMITTED,
        ExamAttempt.Status.GRADED,
    ):
        raise ValidationError("لا يمكن تصحيح محاولة ليست في مرحلة التصحيح.")

    answer = (
        attempt.answers.filter(question_id=question_id)
        .select_related("question")
        .first()
    )
    if answer is None:
        raise ValidationError("لا توجد إجابة لهذا السؤال في هذه المحاولة.")
    if answer.question.question_type != Question.QuestionType.ESSAY:
        raise ValidationError("هذا السؤال ليس مقاليًا — لا يحتاج تصحيحًا يدويًا.")

    link = AssessmentQuestion.objects.filter(
        assessment=attempt.assessment, question=answer.question
    ).first()
    max_points = (
        link.points_override
        if link and link.points_override is not None
        else answer.question.points
    )

    awarded = Decimal(str(awarded_points))
    awarded = min(max(awarded, Decimal("0")), Decimal(str(max_points)))

    answer.is_correct = is_correct
    answer.awarded_points = awarded
    answer.graded_at = timezone.now()
    answer.graded_by = graded_by
    answer.save(
        update_fields=[
            "is_correct",
            "awarded_points",
            "graded_at",
            "graded_by",
            "updated_at",
        ]
    )
    return answer


def recalculate_attempt_score(attempt):
    """Recompute the attempt's total score from graded answers.

    Does NOT change status — the attempt stays SUBMITTED until the staff
    member explicitly calls `finalize_attempt`. This gives a natural
    "review before locking the result" step.
    """
    total = Decimal("0")
    for answer in attempt.answers.all():
        if answer.awarded_points is not None:
            total += answer.awarded_points
    attempt.score = total
    attempt.save(update_fields=["score", "updated_at"])
    return attempt


def finalize_attempt(attempt):
    """Explicit "grading done" action — refuses while essays are pending."""
    if attempt.status not in (
        ExamAttempt.Status.SUBMITTED,
        ExamAttempt.Status.GRADED,
    ):
        raise ValidationError("لا يمكن إنهاء التصحيح لمحاولة ليست في مرحلة التصحيح.")

    pending = attempt.answers.filter(awarded_points__isnull=True).exists()
    if pending:
        raise ValidationError("لا يمكن إنهاء التصحيح قبل تصحيح كل الإجابات المقالية.")

    recalculate_attempt_score(attempt)
    attempt.status = ExamAttempt.Status.GRADED
    attempt.graded_at = timezone.now()
    attempt.is_passed = attempt.compute_is_passed()
    attempt.save(update_fields=["status", "graded_at", "is_passed", "updated_at"])
    return attempt


# ============================================================================
# Anti-cheat — event recording + suspicion scoring
# ============================================================================

EVENT_WEIGHTS = {
    "TAB_HIDDEN": 3,
    "COPY_ATTEMPT": 8,
    "PASTE_ATTEMPT": 8,
    "RIGHT_CLICK": 2,
    "FULLSCREEN_EXIT": 5,
    "DEVTOOLS_OPEN": 15,
}

EVENT_TYPE_CAP = {
    "TAB_HIDDEN": 30,
    "COPY_ATTEMPT": 40,
    "PASTE_ATTEMPT": 40,
    "RIGHT_CLICK": 10,
    "FULLSCREEN_EXIT": 15,
    "DEVTOOLS_OPEN": 30,
}

SUSPICION_CEILING = 100
SUSPICION_THRESHOLD_MINOR = 20
SUSPICION_THRESHOLD_MAJOR = 50


def record_attempt_event(attempt, event_type: str, metadata: dict | None = None):
    """Persist one client-reported event. Silently no-ops if the attempt
    is no longer IN_PROGRESS — the client may fire late events during
    submit; those are ignored rather than erroring."""
    from .models import AttemptEvent

    if attempt.status != ExamAttempt.Status.IN_PROGRESS:
        return None
    if event_type not in AttemptEvent.EventType.values:
        raise ValidationError("نوع حدث غير صالح.")
    return AttemptEvent.objects.create(
        tenant=attempt.tenant,
        attempt=attempt,
        event_type=event_type,
        metadata=metadata or {},
    )


def compute_suspicion(attempt) -> dict:
    """Return {score, level, breakdown} for the attempt."""
    from .models import AttemptEvent

    events = AttemptEvent.objects.filter(attempt=attempt).values("event_type")
    counts: dict[str, int] = {}
    for e in events:
        et = e["event_type"]
        counts[et] = counts.get(et, 0) + 1

    breakdown = []
    total = 0
    for et, count in counts.items():
        weight = EVENT_WEIGHTS.get(et, 0)
        cap = EVENT_TYPE_CAP.get(et, 0)
        contribution = min(count * weight, cap)
        total += contribution
        breakdown.append(
            {
                "event_type": et,
                "count": count,
                "contribution": contribution,
            }
        )

    total = min(total, SUSPICION_CEILING)
    if total < SUSPICION_THRESHOLD_MINOR:
        level = "clean"
    elif total < SUSPICION_THRESHOLD_MAJOR:
        level = "minor"
    else:
        level = "major"

    return {"score": total, "level": level, "breakdown": breakdown}


# ============================================================================
# Wave B2 — Reopen / Void (staff actions)
# ============================================================================

def reopen_attempt(attempt, extended_minutes=None):
    """Re-open a closed attempt so the student can continue.

    Use cases:
      - Student accidentally submitted mid-exam
      - Internet dropped and the timer expired before they could finish
      - Teacher needs to correct a mis-grade and let the student redo

    Allowed from any status EXCEPT IN_PROGRESS (a running attempt has
    nothing to reopen). VOIDED attempts can also be reopened — teachers
    sometimes void by mistake and need a way out.

    Effects:
      - status → IN_PROGRESS
      - submitted_at / graded_at / is_passed / score reset
      - expires_at → capped by the effective window's closes_at when the
        window is still OPEN; otherwise `extended_minutes` (or the
        assessment's duration_minutes) sets the deadline directly.
      - per-answer grading fields reset (is_correct / awarded_points etc.)
        so re-submission re-grades from scratch. Student's chosen_option
        and text_answer are PRESERVED — their work isn't lost.

    The caller must ensure no OTHER IN_PROGRESS attempt exists for the
    same student+assessment before calling this. The view enforces that.

    Post-review fix: expires_at now respects the effective window so a
    reopen cannot push a student past closes_at.
    """
    if attempt.status == ExamAttempt.Status.IN_PROGRESS:
        return attempt

    now = timezone.now()
    duration = extended_minutes or attempt.assessment.duration_minutes

    window = resolve_effective_window(attempt.assessment, attempt.student, now=now)
    # If the window is still open, cap by it. If it's closed (NOT_YET or
    # CLOSED), the staff override wins — extended_minutes is the deadline.
    closes_at = window["closes_at"] if window.get("state") == "OPEN" else None

    expires_at = _compute_expires_at(
        started_at=now,
        duration_minutes=duration,
        closes_at=closes_at,
    )

    attempt.status = ExamAttempt.Status.IN_PROGRESS
    attempt.submitted_at = None
    attempt.graded_at = None
    attempt.is_passed = None
    attempt.score = None
    attempt.expires_at = expires_at
    attempt.save(
        update_fields=[
            "status",
            "submitted_at",
            "graded_at",
            "is_passed",
            "score",
            "expires_at",
            "updated_at",
        ]
    )

    # Reset per-answer grading state, keep the student's actual answers.
    attempt.answers.update(
        is_correct=None,
        awarded_points=None,
        graded_at=None,
        graded_by=None,
    )

    # Notify the student — this is a surprise change to their attempt.
    try:
        notify(
            attempt.student,
            notif_type="EXAM_REOPENED",
            title=f"تم إعادة فتح محاولتك: {attempt.assessment.title}",
            message=(
                f"يمكنك الآن متابعة الإجابة على محاولة #{attempt.attempt_number}."
                + (f" لديك {duration} دقيقة." if duration else "")
            ),
            link=f"/exam/{attempt.id}",
        )
    except Exception:  # noqa: BLE001 — never let a notify failure block reopen
        pass

    return attempt


def void_attempt(attempt, reason=""):
    """Mark an attempt as VOIDED.

    A voided attempt is EXCLUDED from the "used" counter in start_attempt
    (only SUBMITTED / GRADED / EXPIRED count), so the student can retry
    immediately — that's the intended use case (technical failure, proven
    cheating, corrupted answers).

    NOTE: voiding does NOT roll back the attempt_number sequence.
    start_attempt now allocates from MAX(attempt_number)+1, so a voided
    row can never collide with a fresh attempt.

    Idempotent: voiding an already-voided attempt is a no-op.
    """
    if attempt.status == ExamAttempt.Status.VOIDED:
        return attempt

    attempt.status = ExamAttempt.Status.VOIDED
    # score / answers / events kept intact — audit trail must survive.
    attempt.save(update_fields=["status", "updated_at"])

    if reason:
        try:
            from apps.audit.services import log_action

            log_action(
                tenant=attempt.tenant,
                action="attempt.voided",
                obj=attempt,
                metadata={"reason": reason},
            )
        except Exception:  # noqa: BLE001
            pass

    return attempt


# ============================================================================
# Wave C2 — Bulk grading (staff → many attempts in one request)
# ============================================================================

def bulk_grade_and_finalize(attempt_id, grades, finalize, graded_by, tenant):
    """Grade multiple essay answers on ONE attempt, then optionally finalize.

    Called from the `bulk_grade` action with an outer loop over attempts.
    Each attempt is its own transaction — a failure on one does NOT roll
    back the others. The caller collects per-item results.
    """
    try:
        attempt = (
            ExamAttempt.objects.for_tenant(tenant)
            .select_related("assessment")
            .get(id=attempt_id)
        )
    except ExamAttempt.DoesNotExist:
        return {"attempt_id": str(attempt_id), "error": "المحاولة غير موجودة."}

    if attempt.status not in (
        ExamAttempt.Status.SUBMITTED,
        ExamAttempt.Status.GRADED,
    ):
        return {
            "attempt_id": str(attempt_id),
            "error": "لا يمكن تصحيح محاولة ليست في مرحلة التصحيح.",
        }

    try:
        with transaction.atomic():
            for g in grades:
                try:
                    grade_essay_answer(
                        attempt=attempt,
                        question_id=str(g["question_id"]),
                        awarded_points=g["awarded_points"],
                        is_correct=g["is_correct"],
                        graded_by=graded_by,
                    )
                except ValidationError as exc:
                    detail = exc.detail
                    if isinstance(detail, list) and detail:
                        msg = str(detail[0])
                    else:
                        msg = str(detail)
                    raise ValidationError(msg)

            recalculate_attempt_score(attempt)

            if finalize:
                pending = attempt.answers.filter(
                    awarded_points__isnull=True
                ).exists()
                if not pending:
                    finalize_attempt(attempt)

            attempt.refresh_from_db()
    except ValidationError as exc:
        detail = exc.detail
        msg = str(detail[0]) if isinstance(detail, list) and detail else str(detail)
        return {"attempt_id": str(attempt_id), "error": msg}
    except Exception as exc:
        return {"attempt_id": str(attempt_id), "error": str(exc)}

    return {
        "attempt_id": str(attempt.id),
        "status": attempt.status,
        "score": str(attempt.score) if attempt.score is not None else None,
        "is_passed": attempt.is_passed,
    }