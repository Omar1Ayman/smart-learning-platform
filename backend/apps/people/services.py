"""Phase 1.14-1.15 — Term Transition Service.

A student who is enrolled in group A for Term 1 may need to move to
group B for Term 2 (mid-year transfer, rebalancing, schedule conflict).

Semantics:
  - The SOURCE enrollment must be ACTIVE and term-specific (term != null).
  - The TARGET term must belong to the same academic year, and be different.
  - The TARGET group must be in the same academic year AND the same grade.
  - Mark source as COMPLETED, create new enrollment ACTIVE with target_term.

Why same grade? "Moving up a grade" is `Grade.next_grade()` = promotion,
which has its own flow (Rollover). Term transition is orthogonal: same
grade, different group/term.
"""

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.audit.services import log_action

from .models import Enrollment


@transaction.atomic
def transition_term(enrollment, target_term, target_group, *, user):
    """Move an enrollment from its current term to a new term + group.

    Args:
        enrollment: the source Enrollment (must be ACTIVE, term != None).
        target_term: the Term for the new enrollment.
        target_group: the Group for the new enrollment.
        user: actor (for audit log).

    Returns:
        the new Enrollment instance.

    Raises:
        ValidationError: any precondition violation.
    """
    # ---- Source validation ----
    if enrollment.status != Enrollment.Status.ACTIVE:
        raise ValidationError(
            f"التسجيل ليس نشطًا (حالته: {enrollment.get_status_display()}). "
            "نقل الترم متاح فقط للتسجيلات النشطة."
        )

    if enrollment.term_id is None:
        raise ValidationError(
            "هذا التسجيل يشمل السنة كاملة (بدون ترم محدد). "
            "نقل الترم متاح فقط للتسجيلات المرتبطة بترم."
        )

    if enrollment.academic_year_id != target_term.academic_year_id:
        raise ValidationError({"target_term": "الترم الهدف لا ينتمي لنفس السنة الدراسية."})

    if target_term.id == enrollment.term_id:
        raise ValidationError({"target_term": "الترم الهدف لا يمكن أن يكون نفس الترم الحالي."})

    if target_group.academic_year_id != enrollment.academic_year_id:
        raise ValidationError({"target_group": "المجموعة الهدف لا تنتمي لنفس السنة الدراسية."})

    if target_group.grade_id != enrollment.group.grade_id:
        raise ValidationError(
            {
                "target_group": (
                    f"المجموعة الهدف في صف «{target_group.grade.name}» — "
                    f"يجب أن يكون نفس صف التسجيل الحالي "
                    f"«{enrollment.group.grade.name}». "
                    "لتغيير الصف، استخدم Rollover (ترقية الطلاب)."
                )
            }
        )

    if target_group.id == enrollment.group_id:
        raise ValidationError(
            {
                "target_group": (
                    "المجموعة الهدف هي نفس المجموعة الحالية — نقل الترم يتطلب مجموعة مختلفة."
                )
            }
        )

    # ---- Prevent duplicate in target term ----
    duplicate = (
        Enrollment.objects.for_tenant(enrollment.tenant)
        .filter(
            student=enrollment.student,
            academic_year=enrollment.academic_year,
            term=target_term,
        )
        .exclude(id=enrollment.id)
        .exists()
    )
    if duplicate:
        raise ValidationError(
            {"target_term": (f"الطالب {enrollment.student.email} لديه تسجيل بالفعل في هذا الترم.")}
        )

    # ---- Mark source as COMPLETED ----
    enrollment.status = Enrollment.Status.COMPLETED
    enrollment.save(update_fields=["status", "updated_at"])

    # ---- Create new enrollment ----
    new_enrollment = Enrollment.objects.create(
        tenant=enrollment.tenant,
        student=enrollment.student,
        group=target_group,
        academic_year=enrollment.academic_year,
        term=target_term,
        status=Enrollment.Status.ACTIVE,
    )

    # ---- Audit log ----
    log_action(
        actor=user,
        tenant=enrollment.tenant,
        action="enrollment.transitioned",
        obj=new_enrollment,
        metadata={
            "student_id": str(enrollment.student_id),
            "from_enrollment": str(enrollment.id),
            "from_term": enrollment.term.name,
            "from_group": enrollment.group.name,
            "to_term": target_term.name,
            "to_group": target_group.name,
        },
    )

    return new_enrollment
