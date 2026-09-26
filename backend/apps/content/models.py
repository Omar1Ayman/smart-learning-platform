"""
Content: the first model in this codebase where *every* scope field is
independently nullable, on purpose — unlike TeacherAssignment (keyed on
Course because "who teaches what" has one natural shape), Content
genuinely needs arbitrary combinations (spec #27's own example: a book
scoped to Grade + Subject + Term, with no Group at all, must be visible
to every eligible student regardless of which Group they're in). See
apps/content/services.py for how "eligible" is actually computed for a
Student, and PROJECT_MEMORY.md §14 for why this model looks different
from TeacherAssignment's.
"""

import uuid

from django.db import models

from apps.academics.models import AcademicYear, Chapter, Course, Grade, Group, Lesson, Stage, Subject, Term
from apps.common.models import TenantScopedModel

from .validators import generate_storage_filename


def content_upload_path(instance, filename):
    # instance.tenant_id is available even on first save (set by
    # perform_create before .save() is called) — namespaced per tenant
    # purely for operational tidiness (backups, manual inspection), not
    # as a security boundary; the real boundary is the authenticated
    # download view (see views.py), never a guessable/public media URL.
    return f"tenants/{instance.tenant_id}/content/{generate_storage_filename(filename)}"


class Content(TenantScopedModel):
    class ContentType(models.TextChoices):
        PDF = "PDF", "PDF"
        VIDEO = "VIDEO", "Video"
        IMAGE = "IMAGE", "Image"
        DOCUMENT = "DOCUMENT", "Document"
        EXTERNAL_LINK = "EXTERNAL_LINK", "External Link"
        TEXT = "TEXT", "Text"
        BOOK = "BOOK", "Book"
        SUMMARY = "SUMMARY", "Summary"
        LESSON_EXPLANATION = "LESSON_EXPLANATION", "Lesson Explanation"
        CHAPTER_RESOURCE = "CHAPTER_RESOURCE", "Chapter Resource"

    class ScanStatus(models.TextChoices):
        # No scanner is wired up yet (spec #78 lists this as "if
        # appropriate") — CLEAN is the default so nothing already
        # uploaded silently becomes inaccessible if/when a real scanner
        # is added; PENDING/INFECTED exist so that addition doesn't need
        # a schema change.
        CLEAN = "CLEAN", "Clean"
        PENDING = "PENDING", "Pending scan"
        INFECTED = "INFECTED", "Infected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    content_type = models.CharField(max_length=30, choices=ContentType.choices)
    description = models.TextField(blank=True, default="")

    # Exactly one of these three is populated, depending on content_type —
    # enforced in ContentSerializer.validate(), not at the DB level (a
    # CheckConstraint expressing "exactly one of three columns is
    # non-empty" is possible but the error message from a failed
    # CheckConstraint is far less useful than a serializer ValidationError,
    # and this is a business rule, not a security boundary).
    file = models.FileField(upload_to=content_upload_path, null=True, blank=True)
    original_filename = models.CharField(max_length=255, blank=True, default="")
    external_url = models.URLField(blank=True, default="")
    text_body = models.TextField(blank=True, default="")

    scan_status = models.CharField(max_length=20, choices=ScanStatus.choices, default=ScanStatus.CLEAN)
    is_published = models.BooleanField(default=True)
    # Reserved for a future public-preview feature — no endpoint reads
    # this yet, so setting it True does not currently expose anything.
    is_public = models.BooleanField(default=False)

    # Flexible scope (spec #27) — every field independently optional.
    stage = models.ForeignKey(Stage, null=True, blank=True, on_delete=models.CASCADE, related_name="contents")
    grade = models.ForeignKey(Grade, null=True, blank=True, on_delete=models.CASCADE, related_name="contents")
    group = models.ForeignKey(Group, null=True, blank=True, on_delete=models.CASCADE, related_name="contents")
    subject = models.ForeignKey(
        Subject, null=True, blank=True, on_delete=models.CASCADE, related_name="contents"
    )
    course = models.ForeignKey(
        Course, null=True, blank=True, on_delete=models.CASCADE, related_name="contents"
    )
    chapter = models.ForeignKey(
        Chapter, null=True, blank=True, on_delete=models.CASCADE, related_name="contents"
    )
    lesson = models.ForeignKey(
        Lesson, null=True, blank=True, on_delete=models.CASCADE, related_name="contents"
    )
    academic_year = models.ForeignKey(
        AcademicYear, null=True, blank=True, on_delete=models.CASCADE, related_name="contents"
    )
    term = models.ForeignKey(Term, null=True, blank=True, on_delete=models.CASCADE, related_name="contents")

    created_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="uploaded_content"
    )

    class Meta:
        db_table = "content_content"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title
