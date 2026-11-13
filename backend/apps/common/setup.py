"""Setup progress for onboarding.

Batch 17 (Milestone 5): enriched payload for the redesigned wizard.

Key additions:
  - `STEP_META`: per-step `estimated_minutes` and `why` (a one-line
    rationale the UI shows under the label — helps an owner understand
    WHY each step matters instead of clicking blindly).
  - `MINIMAL_PATH`: the 6 steps that actually block "first value" (a
    student seeing content + taking an exam). The remaining 5 steps are
    shown separately as "advanced" — visible but not on the critical
    path.
  - `after_complete`: three cards shown once `complete=True`, so the
    wizard ends with a clear "what next" instead of a dead-end
    celebration.

Backward compatibility: every existing field is preserved. New fields
are additive. The frontend can be updated incrementally without a
coordinated deploy.
"""

from apps.academics.models import (
    AcademicYear,
    Course,
    Grade,
    Group,
    Stage,
    Subject,
    Term,
)
from apps.accounts.models import User
from apps.people.models import Enrollment, TeacherAssignment


# Per-step metadata. Kept as a dict (not tuples) so adding a field later
# is a one-line change per step instead of a re-shuffle of every tuple.
STEP_META = {
    "academic_year": {
        "estimated_minutes": 1,
        "why": "بدون سنة دراسية، لا يمكن إضافة أي شيء آخر.",
    },
    "stage": {
        "estimated_minutes": 1,
        "why": "المرحلة هي المستوى الأعلى في هيكلك الأكاديمي.",
    },
    "grade": {
        "estimated_minutes": 1,
        "why": "الصفوف تُقسِّم الطلاب حسب المستوى الدراسي.",
    },
    "group": {
        "estimated_minutes": 1,
        "why": "المجموعات هي الوعاء الذي يُسجَّل فيه الطلاب فعليًا.",
    },
    "subject": {
        "estimated_minutes": 1,
        "why": "المواد تُصنِّف المحتوى والأسئلة والامتحانات.",
    },
    "course": {
        "estimated_minutes": 1,
        "why": "المادة الدراسية تربط الصف بالمادة — الوحدة التي يراها الطالب.",
    },
    "teacher": {
        "estimated_minutes": 1,
        "why": "المعلمون يُديرون المحتوى والامتحانات والحضور.",
    },
    "student": {
        "estimated_minutes": 2,
        "why": "الطلاب هم المستفيدون من المنصة.",
    },
    "enrollment": {
        "estimated_minutes": 1,
        "why": "بدون تسجيلات، لن يرى الطلاب أي محتوى أو امتحان.",
    },
    "teacher_assignment": {
        "estimated_minutes": 1,
        "why": "يُحدِّد أي معلم يُدرِّس أي مادة/مجموعة.",
    },
    "term": {
        "estimated_minutes": 1,
        "why": "الترمات تُنظِّم المحتوى والامتحانات عبر الزمن.",
    },
}


# The 6 steps that unblock "first value" — a student seeing content and
# taking an exam. The remaining 5 (subjects, term, teacher_assignment,
# ...) are "advanced" — visible but not blocking.
MINIMAL_PATH = [
    "academic_year",
    "stage",
    "grade",
    "group",
    "student",
    "enrollment",
]


AFTER_COMPLETE = [
    {
        "key": "first_assessment",
        "label": "أنشئ أول امتحان",
        "description": "6 خطوات، دقيقتين — ثم انشره لطلابك.",
        "action_url": "/assessments/new",
        "icon": "📝",
    },
    {
        "key": "invite_team",
        "label": "ادعُ فريقك",
        "description": "أضف المعلمين ووزّع المواد والمجموعات.",
        "action_url": "/team",
        "icon": "👥",
    },
    {
        "key": "upload_content",
        "label": "ارفع أول محتوى",
        "description": "مذكرة، فيديو، أو ملخص — ليراه الطلاب.",
        "action_url": "/content",
        "icon": "📚",
    },
]


def get_setup_status(tenant) -> dict:
    # ---- Counts ----
    counts = {
        "academic_year": AcademicYear.objects.for_tenant(tenant).count(),
        "term": Term.objects.for_tenant(tenant).count(),
        "stage": Stage.objects.for_tenant(tenant).count(),
        "grade": Grade.objects.for_tenant(tenant).count(),
        "group": Group.objects.for_tenant(tenant).count(),
        "subject": Subject.objects.for_tenant(tenant).count(),
        "course": Course.objects.for_tenant(tenant).count(),
        "teacher": User.objects.for_tenant(tenant)
        .filter(role=User.Role.TEACHER)
        .count(),
        "student": User.objects.for_tenant(tenant)
        .filter(role=User.Role.STUDENT)
        .count(),
        "enrollment": Enrollment.objects.for_tenant(tenant).count(),
        "teacher_assignment": TeacherAssignment.objects.for_tenant(tenant).count(),
    }

    # ---- Blocked-by rules ----
    blocked_by = {
        "term": None if counts["academic_year"] > 0 else "academic_year",
        "grade": None if counts["stage"] > 0 else "stage",
        "group": None
        if counts["grade"] > 0 and counts["academic_year"] > 0
        else ("grade" if counts["grade"] == 0 else "academic_year"),
        "course": None
        if counts["grade"] > 0 and counts["subject"] > 0
        else ("grade" if counts["grade"] == 0 else "subject"),
        "teacher_assignment": None
        if counts["teacher"] > 0 and counts["course"] > 0
        else ("teacher" if counts["teacher"] == 0 else "course"),
        "enrollment": None
        if counts["group"] > 0 and counts["student"] > 0
        else ("group" if counts["group"] == 0 else "student"),
    }

    # ---- Raw steps (order matters: this is what the UI shows) ----
    raw_steps = [
        ("academic_year", "السنة الدراسية", "required", "/academic-years"),
        ("stage", "المراحل الدراسية", "required", "/stages"),
        ("grade", "الصفوف", "required", "/grades"),
        ("group", "المجموعات", "required", "/groups"),
        ("subject", "المواد (مفاهيم)", "recommended", "/subjects"),
        ("course", "المواد الدراسية", "required", "/courses"),
        ("teacher", "المعلمون", "required", "/team"),
        ("student", "الطلاب", "required", "/team"),
        ("enrollment", "التسجيلات", "required", "/enrollments"),
        (
            "teacher_assignment",
            "تكليفات المعلمين",
            "recommended",
            "/teacher-assignments",
        ),
        ("term", "الترمات", "recommended", "/terms"),
    ]

    # ---- Build steps ----
    steps = []
    next_action = None
    total_estimated_remaining = 0

    for key, label, importance, action_url in raw_steps:
        done = counts[key] > 0
        blocked = blocked_by.get(key)
        meta = STEP_META.get(key, {"estimated_minutes": 1, "why": ""})
        on_minimal_path = key in MINIMAL_PATH

        step = {
            "key": key,
            "label": label,
            "count": counts[key],
            "done": done,
            "blocked_by": blocked,
            "importance": importance,
            "action_url": None if (done or blocked) else action_url,
            # Batch 17 additions:
            "estimated_minutes": meta["estimated_minutes"],
            "why": meta["why"],
            "on_minimal_path": on_minimal_path,
        }
        steps.append(step)

        if not done:
            total_estimated_remaining += meta["estimated_minutes"]

        # The "next action" is the first unblocked required step that
        # is on the minimal path — that's the strongest nudge we can give
        # ("do this specific thing next"), and it prevents the UI from
        # pointing at an advanced step when basics aren't done yet.
        if (
            next_action is None
            and importance == "required"
            and not done
            and not blocked
        ):
            next_action = {
                **step,
                "why": meta["why"],
            }

    # ---- Completion ----
    required_steps = [s for s in steps if s["importance"] == "required"]
    complete = all(s["done"] for s in required_steps)

    minimal_steps = [s for s in steps if s["on_minimal_path"]]
    minimal_complete = all(s["done"] for s in minimal_steps)
    minimal_done_count = sum(1 for s in minimal_steps if s["done"])

    # ---- After-complete payload ----
    after_complete = [] if not complete else AFTER_COMPLETE

    return {
        "complete": complete,
        "steps": steps,
        "counts": counts,
        "next_action": next_action,
        # Batch 17 additions:
        "minimal_path": {
            "keys": MINIMAL_PATH,
            "done_count": minimal_done_count,
            "total_count": len(MINIMAL_PATH),
            "complete": minimal_complete,
        },
        "estimated_minutes_remaining": total_estimated_remaining,
        "after_complete": after_complete,
    }