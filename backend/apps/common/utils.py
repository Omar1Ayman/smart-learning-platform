"""Shared helper utilities."""

from rest_framework.exceptions import ValidationError


def unique_copy_name(base_name, exists_fn, max_tries=100):
    """Generate a unique copy name by appending "(نسخة)", "(نسخة 2)", ...

    `exists_fn(candidate_name) -> bool` — the caller decides what
    "already exists" means for its own scope (e.g., same tenant + grade +
    subject for Course، or same tenant for Assessment).

    Used by duplicate endpoints so a teacher can duplicate "Math Midterm"
    multiple times and get "Math Midterm (نسخة)"، "Math Midterm (نسخة 2)"،
    etc. — without a hard failure on the unique constraint (Course) or
    silent ambiguity (Assessment, which has no unique constraint on title
    but benefits from clarity).

    Raises ValidationError if max_tries is exhausted — a name so long it
    can't find a unique variant is genuinely a problem worth surfacing,
    not papering over.
    """
    candidate = f"{base_name} (نسخة)"
    if not exists_fn(candidate):
        return candidate
    for i in range(2, max_tries + 1):
        candidate = f"{base_name} (نسخة {i})"
        if not exists_fn(candidate):
            return candidate
    raise ValidationError("تعذّر توليد اسم فريد للنسخة — حاول باسم أقصر.")
