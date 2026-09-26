"""
spec #78 — file upload security. Every rule here is checked at the
serializer/validator level, server-side, before a file is ever written to
disk; nothing about it is enforced only by the frontend (SECURITY.md #1's
whole point, applied here).

Deliberately NOT implemented here (documented, not silently skipped):
- Malware/antivirus scanning — needs an external scanner (ClamAV, a cloud
  API); `Content.scan_status` exists as the hook for it, default CLEAN
  since nothing currently populates PENDING/INFECTED. See PROJECT_MEMORY.md.
- Production object storage (S3-style, private ACLs, signed URLs) — local
  disk today; swapping Django's STORAGES setting later needs no model or
  validator changes, by design.
"""

import uuid

from django.core.exceptions import ValidationError

try:
    import magic

    _HAS_MAGIC = True
except ImportError:  # pragma: no cover - exercised only if libmagic is missing
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


def validate_uploaded_file(uploaded_file, content_type: str) -> None:
    """Extension + real-MIME-sniff + size, per spec #78. Raises
    django.core.exceptions.ValidationError (caught and converted to a
    clean DRF 400 by the serializer, not left to bubble up)."""
    rules = UPLOAD_RULES.get(content_type)
    if rules is None:
        raise ValidationError(f"لا يوجد رفع ملفات لنوع المحتوى {content_type}.")
    allowed_extensions, allowed_mime_prefixes, max_size = rules

    name = uploaded_file.name or ""
    extension = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if extension not in allowed_extensions:
        raise ValidationError(
            f"امتداد الملف غير مسموح لهذا النوع. المسموح: {', '.join(sorted(allowed_extensions))}."
        )

    if uploaded_file.size > max_size:
        raise ValidationError(f"حجم الملف أكبر من الحد المسموح ({max_size // (1024 * 1024)} ميجابايت).")

    # Real content sniffing — never trust the extension or the client-sent
    # Content-Type header alone; both are just strings the uploader chose.
    if _HAS_MAGIC:
        head = uploaded_file.read(4096)
        uploaded_file.seek(0)
        sniffed_mime = magic.from_buffer(head, mime=True)
        if not any(sniffed_mime.startswith(prefix) for prefix in allowed_mime_prefixes):
            raise ValidationError(f"محتوى الملف الفعلي ({sniffed_mime}) لا يطابق امتداده. تم رفض الملف.")


def generate_storage_filename(original_filename: str) -> str:
    """The path Django actually writes to disk never contains anything the
    uploader supplied — it's a fresh UUID plus a whitelisted extension
    only. This is what makes path traversal via a crafted filename
    (spec #78) structurally impossible here, not just filtered: there's
    nothing left of the original name to traverse with."""
    extension = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else "bin"
    extension = "".join(ch for ch in extension if ch.isalnum())[:10] or "bin"
    return f"{uuid.uuid4()}.{extension}"
