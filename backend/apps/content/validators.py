"""File upload security.

Every rule is checked at the serializer/validator level, server-side,
before a file is ever written to disk.

Wave 29 — `validate_uploaded_file` now takes an optional
`max_size_override_mb` so the tenant's `content_policy.max_file_size_mb`
can cap uploads at a lower value than the hardcoded per-type limits.
The override is applied as `min(override, per_type_limit)` — an OWNER
who sets `max_file_size_mb = 5` can't upload a 100MB video even though
the VIDEO type allows 300MB.
"""

import uuid

from django.core.exceptions import ValidationError

try:
    import magic
    _HAS_MAGIC = True
    _HAS_MAGIC = True
except ImportError:  # pragma: no cover
    _HAS_MAGIC = False


# Per content_type: (allowed extensions, allowed sniffed MIME prefixes, max bytes)
UPLOAD_RULES = {
    "PDF": ({"pdf"}, {"application/pdf"}, 20 * 1024 * 1024),
    "VIDEO": ({"mp4", "webm", "mov"}, {"video/"}, 300 * 1024 * 1024),
    "IMAGE": ({"jpg", "jpeg", "png", "webp", "gif"}, {"image/"}, 5 * 1024 * 1024),
    "DOCUMENT": (
        {"pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx"},
        {"application/pdf", "application/msword", "application/vnd.", "application/zip"},
        20 * 1024 * 1024,
    ),
    "BOOK": (
        {"pdf", "epub"},
        {"application/pdf", "application/epub+zip", "application/zip"},
        50 * 1024 * 1024,
    ),
    "CHAPTER_RESOURCE": (
        {"pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "zip"},
        {"application/pdf", "application/msword", "application/vnd.", "application/zip"},
        20 * 1024 * 1024,
    ),
}

FILE_CONTENT_TYPES = set(UPLOAD_RULES)
URL_CONTENT_TYPES = {"EXTERNAL_LINK"}
TEXT_CONTENT_TYPES = {"TEXT", "SUMMARY", "LESSON_EXPLANATION"}


def validate_uploaded_file(
    uploaded_file, content_type: str, max_size_override_mb: int | None = None
) -> None:
    """Extension + real-MIME-sniff + size, per spec #78.

    `max_size_override_mb` (optional) is the tenant's `content_policy.
    max_file_size_mb`. When set, it caps the effective max size at
    `min(per_type_limit, override)`. This lets a small tutoring center
    (say, 5MB cap) block large uploads without changing the code.
    """
    rules = UPLOAD_RULES.get(content_type)
    if rules is None:
        raise ValidationError(f"لا يوجد رفع ملفات لنوع المحتوى {content_type}.")
    allowed_extensions, allowed_mime_prefixes, per_type_max = rules

    name = uploaded_file.name or ""
    extension = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if extension not in allowed_extensions:
        raise ValidationError(
            f"امتداد الملف غير مسموح لهذا النوع. المسموح: {', '.join(sorted(allowed_extensions))}."
        )

    # Effective cap = min(per_type, tenant_override)
    effective_max = per_type_max
    if max_size_override_mb is not None:
        override_bytes = max_size_override_mb * 1024 * 1024
        effective_max = min(per_type_max, override_bytes)

    if uploaded_file.size > effective_max:
        raise ValidationError(
            f"حجم الملف أكبر من الحد المسموح ({effective_max // (1024 * 1024)} ميجابايت)."
        )

    # Real content sniffing — fail closed if libmagic is unavailable.
    if not _HAS_MAGIC:
        raise ValidationError("فحص محتوى الملفات غير متاح على الخادم حاليًا. الرفع معطّل مؤقتًا.")
    head = uploaded_file.read(4096)
    uploaded_file.seek(0)
    sniffed_mime = magic.from_buffer(head, mime=True)
    if not any(sniffed_mime.startswith(prefix) for prefix in allowed_mime_prefixes):
        raise ValidationError(
            f"محتوى الملف الفعلي ({sniffed_mime}) لا يطابق امتداده. تم رفض الملف."
        )


def generate_storage_filename(original_filename: str) -> str:
    """Path is a UUID + whitelisted extension — never the original name."""
    extension = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else "bin"
    extension = "".join(ch for ch in extension if ch.isalnum())[:10] or "bin"
    return f"{uuid.uuid4()}.{extension}"
