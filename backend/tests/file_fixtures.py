"""Small, genuinely-valid file fixtures for upload tests — real magic
bytes, not just a filename, since that's exactly what the MIME-sniff
validator (apps/content/validators.py) checks."""

import io

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

MINIMAL_PDF_BYTES = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"


def make_pdf(name="lesson.pdf"):
    return SimpleUploadedFile(name, MINIMAL_PDF_BYTES, content_type="application/pdf")


def make_png(name="diagram.png"):
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), color="red").save(buf, format="PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


def make_oversized_pdf(name="huge.pdf", size_bytes=21 * 1024 * 1024):
    # Real PDF header, then padding — sniffs as a real PDF, so this
    # exercises the *size* check specifically, not the MIME check.
    payload = MINIMAL_PDF_BYTES + b"\x00" * (size_bytes - len(MINIMAL_PDF_BYTES))
    return SimpleUploadedFile(name, payload, content_type="application/pdf")


def make_png_disguised_as_pdf(name="fake.pdf"):
    """The actual bytes are a real PNG; only the filename claims PDF —
    this is exactly what the MIME-sniff check exists to catch."""
    buf = io.BytesIO()
    Image.new("RGB", (4, 4), color="blue").save(buf, format="PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="application/pdf")
