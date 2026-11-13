"""
Single source of truth for model dependencies.

Every tenant-owned entity has an explicit position in this tree. The
rules here drive three things:

1. `check_orphans` — a management command that finds any row whose
   required parent chain is broken.
2. `GET /api/v1/setup-status/` — the guided-setup endpoint that tells
   the frontend "here's what's done, here's what's blocked and by what".
3. Documentation — anyone reading the code sees the intended hierarchy
   in one file, not scattered across serializers.

**Do not add per-form validation that isn't reflected here.** If a form
needs a rule, add it to `BLOCKING_RULES` or `WARNING_RULES` below first,
then wire it into the serializer. That keeps the frontend and backend
in sync.

Terminology:
- BLOCKING: rejects the request (400). Data integrity depends on it.
- WARNING: allowed but flagged in `_warnings` on the response. The user
  sees it, can still proceed. Used where enforcing would be too rigid
  for real school workflows (e.g., enrollments before teachers are
  assigned).
"""

# ---------------------------------------------------------------------------
# Hierarchy (informational + drives check_orphans)
# ---------------------------------------------------------------------------
# Each entry: model_name -> list of "required" FK fields.
# A row is an *orphan* if any of these FK fields points to a missing row
# (usually only possible after a broken data import or manual SQL).
MODEL_REQUIRES = {
    "Term": ["academic_year"],
    "Grade": ["stage"],
    "Group": ["grade", "academic_year"],
    "Course": ["subject", "grade"],
    "Chapter": ["course"],
    "Lesson": ["chapter"],
    "Enrollment": ["student", "group", "academic_year"],
    "TeacherAssignment": ["teacher", "course"],
    "Question": ["bank"],
    "QuestionBank": [],
    "Content": [],  # every scope field independently optional
    "Assessment": [],
}

# ---------------------------------------------------------------------------
# Blocking rules (validated in serializers)
# ---------------------------------------------------------------------------
# Keyed by model. Each rule is described for documentation; the actual
# check lives in the serializer. Keep this in sync — the rules here are
# what a reviewer reads before reading serializer code.
BLOCKING_RULES = {
    "Enrollment": [
        "student.role must be STUDENT (not TEACHER/ADMIN/OWNER)",
        "group.academic_year must match the tenant's current context",
        "term (if provided) must belong to group.academic_year",
    ],
    "TeacherAssignment": [
        "teacher.role must be TEACHER",
        "every group in groups must belong to course.grade",
    ],
    "Course": [
        "subject and grade must belong to the caller's tenant",
        "term (if provided) requires academic_year (enforced by DB CHECK)",
        "term (if provided) must belong to academic_year",
    ],
    "Assessment": [
        "publish requires >=1 question (all still APPROVED)",
        "publish requires >=1 target",
        "publish requires reach > 0 (at least one student matches)",
    ],
}

# ---------------------------------------------------------------------------
# Warning rules (emitted as _warnings on success responses)
# ---------------------------------------------------------------------------
WARNING_RULES = {
    "Enrollment": [
        "group has no TeacherAssignment — student will have no one teaching",
    ],
    "Course": [
        "grade has no groups yet — course exists but no class can study it",
    ],
    "Group": [
        "grade has no courses yet — group exists but nothing to teach",
    ],
    "Content": [
        "content attached to a lesson in a course the creator does not teach",
    ],
}