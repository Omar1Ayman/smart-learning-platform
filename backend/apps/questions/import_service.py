"""
Wave D1a — bulk import for questions (CSV / XLSX).

Column format:
    bank_name, text, question_type, difficulty, topic, points,
    options, accepted_answers, explanation

Options format:
    - MCQ / TRUE_FALSE: pipe-separated. Append `*` to exactly one option
      to mark it as the correct answer. Example: "x=2|x=3*|x=4".
      For TRUE_FALSE the texts are normalized to "صح"/"خطأ" — any other
      text is rejected (same rule as the single-question API).
    - SHORT_ANSWER: `accepted_answers` column holds the list (comma-
      separated). The `options` column must be empty.
    - ESSAY: both `options` and `accepted_answers` must be empty.

Banks:
    `bank_name` is matched case-insensitively to an existing bank in the
    tenant; a missing bank is auto-created. This means a teacher can
    upload a whole question bank in one file without pre-creating it.

Validation & atomicity:
    - Every row is validated independently. Errors are collected per row,
      not just the first.
    - If ANY row has an error, the commit path is refused (all-or-nothing).
      The preview (dry_run) always returns the full per-row analysis so
      the user can fix the file in one pass.
"""

import csv
import io
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User

from .models import Question, QuestionBank, QuestionOption

MAX_IMPORT_BYTES = 10 * 1024 * 1024  # 10 MB — enough for ~50k rows CSV
REQUIRED_HEADERS = {
    "bank_name",
    "text",
    "question_type",
    "options",
    "accepted_answers",
}

VALID_TYPES = {"MCQ", "TRUE_FALSE", "SHORT_ANSWER", "ESSAY"}
VALID_DIFFICULTIES = {"EASY", "MEDIUM", "HARD"}
TRUE_FALSE_CANONICAL = {"صح", "خطأ"}


@dataclass
class RowAnalysis:
    row: int
    bank_name: str
    text: str
    question_type: str
    difficulty: str
    topic: str
    points: str
    options_raw: str
    accepted_answers_raw: str
    explanation: str
    status: str = "valid"  # "valid" | "error"
    errors: list[str] = field(default_factory=list)
    parsed: dict | None = None


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------


def _read_rows(raw_bytes: bytes) -> list[dict]:
    """Detect CSV vs XLSX, return list of dicts with lowercase headers."""
    if len(raw_bytes) > MAX_IMPORT_BYTES:
        raise ValueError(
            f"حجم الملف ({len(raw_bytes) // (1024 * 1024)} ميجابايت) يتجاوز "
            f"الحد المسموح ({MAX_IMPORT_BYTES // (1024 * 1024)} ميجابايت)."
        )

    if raw_bytes[:4] == b"PK\x03\x04":  # XLSX (zip)
        return _read_xlsx(raw_bytes)
    return _read_csv(raw_bytes)


def _read_csv(raw_bytes: bytes) -> list[dict]:
    """Parse CSV. Raises a friendly error if any row has extra fields —
    that always means a comma inside a value wasn't quoted, which would
    otherwise silently mangle data (accepted_answers losing its second
    entry, explanation getting the wrong text, etc.)."""
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw_bytes.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    rows: list[dict] = []
    for idx, r in enumerate(reader, start=2):  # header = row 1
        # `DictReader` puts surplus fields under the special key `None`.
        # This always means the user has an unquoted comma inside a value.
        if None in r:
            raise ValueError(
                f"السطر {idx}: عدد القيم أكثر من الأعمدة — "
                "تحقق من الفواصل داخل الخلايا. "
                'استخدم علامات التنصيص "..." إذا احتجت لكتابة فاصلة داخل خلية.'
            )
        rows.append({(k or "").strip().lower(): (v or "").strip() for k, v in r.items()})
    return rows


def _read_xlsx(raw_bytes: bytes) -> list[dict]:
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(raw_bytes), read_only=True, data_only=True)
    ws = wb.active
    it = ws.iter_rows(values_only=True)
    try:
        headers = [str(c or "").strip().lower() for c in next(it)]
    except StopIteration:
        return []
    rows = []
    for raw in it:
        if raw is None or all(c is None or str(c).strip() == "" for c in raw):
            continue
        rows.append(
            {
                headers[i]: (str(v).strip() if v is not None else "")
                for i, v in enumerate(raw)
                if i < len(headers)
            }
        )
    return rows


def _parse_options(raw: str) -> list[dict] | None:
    """`"A|B*|C"` → list of option dicts. `*` suffix marks correct.

    Returns None if the raw string is empty (only valid for non-MCQ types).
    Raises ValueError with a clear message for malformed input.
    """
    if not raw or not raw.strip():
        return None

    parts = [p.strip() for p in raw.split("|")]
    parts = [p for p in parts if p]  # drop empties (trailing pipes ok)
    if len(parts) < 2:
        raise ValueError("مطلوب خياران على الأقل (مفصولان بـ |)")

    correct_count = sum(1 for p in parts if p.endswith("*"))
    if correct_count != 1:
        raise ValueError(f"يجب تحديد إجابة صحيحة واحدة بعلامة * (وُجد {correct_count})")

    options: list[dict] = []
    for i, p in enumerate(parts, 1):
        is_correct = p.endswith("*")
        text = p[:-1].strip() if is_correct else p.strip()
        if not text:
            raise ValueError(f"الخيار {i} فارغ")
        options.append({"text": text, "is_correct": is_correct, "order": i})
    return options


def _parse_accepted(raw: str) -> list[str]:
    if not raw or not raw.strip():
        return []
    return [p.strip() for p in raw.split(",") if p.strip()]


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def validate_rows(tenant, rows: list[dict]) -> list[RowAnalysis]:
    """Validate every row independently and return per-row analysis."""
    analysis: list[RowAnalysis] = []
    existing_banks = {b.name.strip().lower(): b for b in QuestionBank.objects.for_tenant(tenant)}

    for idx, row in enumerate(rows, start=2):  # header = row 1
        bank_name = (row.get("bank_name") or "").strip()
        text = (row.get("text") or "").strip()
        qtype = (row.get("question_type") or "").strip().upper()
        difficulty = (row.get("difficulty") or "MEDIUM").strip().upper() or "MEDIUM"
        topic = (row.get("topic") or "").strip()
        points_str = (row.get("points") or "1").strip() or "1"
        options_raw = (row.get("options") or "").strip()
        accepted_raw = (row.get("accepted_answers") or "").strip()
        explanation = (row.get("explanation") or "").strip()

        errors: list[str] = []

        if not bank_name:
            errors.append("اسم البنك مطلوب")
        if not text:
            errors.append("نص السؤال مطلوب")
        if qtype not in VALID_TYPES:
            errors.append(
                f"نوع السؤال غير صالح ({qtype}) — المسموح: {', '.join(sorted(VALID_TYPES))}"
            )
        if difficulty not in VALID_DIFFICULTIES:
            errors.append(
                f"مستوى الصعوبة غير صالح ({difficulty}) — المسموح: {', '.join(sorted(VALID_DIFFICULTIES))}"
            )

        try:
            points = Decimal(points_str)
            if points <= 0:
                raise InvalidOperation
        except (InvalidOperation, ValueError):
            errors.append(f"النقاط غير صالحة ({points_str}) — يجب أن تكون رقماً موجباً")
            points = Decimal("1")

        options = None
        accepted = []
        try:
            if qtype in ("MCQ", "TRUE_FALSE"):
                options = _parse_options(options_raw)
                if options is None:
                    errors.append("هذا النوع يتطلب عمود options")

                if qtype == "TRUE_FALSE" and options is not None:
                    texts = {o["text"] for o in options}
                    if texts != TRUE_FALSE_CANONICAL:
                        errors.append("سؤال صح/خطأ يجب أن يكون خياراه بالضبط: 'صح' و 'خطأ'")

                if accepted_raw:
                    errors.append("هذا النوع لا يقبل accepted_answers")

            elif qtype == "SHORT_ANSWER":
                accepted = _parse_accepted(accepted_raw)
                if not accepted:
                    errors.append("هذا النوع يتطلب accepted_answers")
                if options_raw:
                    errors.append("هذا النوع لا يقبل options")

            elif qtype == "ESSAY":
                if options_raw:
                    errors.append("السؤال المقالي لا يقبل options")
                if accepted_raw:
                    errors.append("السؤال المقالي لا يقبل accepted_answers")

        except ValueError as exc:
            errors.append(str(exc))

        row_status = "error" if errors else "valid"
        parsed = None
        if row_status == "valid":
            parsed = {
                "bank_name": bank_name,
                "text": text,
                "question_type": qtype,
                "difficulty": difficulty,
                "topic": topic,
                "points": points,
                "options": options or [],
                "accepted_answers": accepted,
                "explanation": explanation,
            }

        analysis.append(
            RowAnalysis(
                row=idx,
                bank_name=bank_name,
                text=text,
                question_type=qtype,
                difficulty=difficulty,
                topic=topic,
                points=str(points),
                options_raw=options_raw,
                accepted_answers_raw=accepted_raw,
                explanation=explanation,
                status=row_status,
                errors=errors,
                parsed=parsed,
            )
        )

    return analysis


# ---------------------------------------------------------------------------
# Commit
# ---------------------------------------------------------------------------


def import_questions(tenant, analysis: list[RowAnalysis], author) -> dict:
    """Create Question + options for every valid row, in one transaction.

    Assumes the caller already ran `validate_rows` and confirmed that no
    row has errors. Auto-creates missing banks.
    """
    # Determine review state based on tenant policy (same as single-create).
    policy = tenant.get_policy("question_policy")
    require_review = policy.get("require_review", True)
    owners_can_self_approve = policy.get("owners_can_self_approve", True)
    auto_approve = not require_review or (
        author.role in (User.Role.OWNER, User.Role.ADMIN) and owners_can_self_approve
    )

    created_questions = 0
    created_banks = 0
    new_bank_names: set[str] = set()

    with transaction.atomic():
        bank_cache: dict[str, QuestionBank] = {
            b.name.strip().lower(): b for b in QuestionBank.objects.for_tenant(tenant)
        }

        for item in analysis:
            if item.status != "valid" or not item.parsed:
                continue

            key = item.parsed["bank_name"].strip().lower()
            bank = bank_cache.get(key)
            if bank is None:
                bank = QuestionBank.objects.create(
                    tenant=tenant,
                    name=item.parsed["bank_name"].strip(),
                    created_by=author,
                )
                bank_cache[key] = bank
                created_banks += 1
                new_bank_names.add(bank.name)

            question = Question.objects.create(
                tenant=tenant,
                bank=bank,
                text=item.parsed["text"],
                question_type=item.parsed["question_type"],
                difficulty=item.parsed["difficulty"],
                topic=item.parsed["topic"],
                points=item.parsed["points"],
                accepted_answers=item.parsed["accepted_answers"],
                explanation=item.parsed["explanation"],
                created_by=author,
                review_status=(
                    Question.ReviewStatus.APPROVED
                    if auto_approve
                    else Question.ReviewStatus.PENDING
                ),
                reviewed_by=author if auto_approve else None,
                reviewed_at=timezone.now() if auto_approve else None,
                review_note="اعتماد تلقائي (سياسة المؤسسة)" if auto_approve else "",
            )

            for opt in item.parsed["options"]:
                QuestionOption.objects.create(
                    tenant=tenant,
                    question=question,
                    text=opt["text"],
                    is_correct=opt["is_correct"],
                    order=opt["order"],
                )

            created_questions += 1

    return {
        "created_questions": created_questions,
        "created_banks": created_banks,
        "new_bank_names": sorted(new_bank_names),
        "auto_approved": auto_approve,
    }


# ---------------------------------------------------------------------------
# Template
# ---------------------------------------------------------------------------


def build_template_xlsx() -> io.BytesIO:
    """Generate a ready-to-use XLSX template with 3 example rows."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "questions"
    ws.sheet_view.rightToLeft = True

    headers = [
        "bank_name",
        "text",
        "question_type",
        "difficulty",
        "topic",
        "points",
        "options",
        "accepted_answers",
        "explanation",
    ]

    header_font = Font(bold=True, color="FFFFFF", size=11)
    header_fill = PatternFill(start_color="2B3A67", end_color="2B3A67", fill_type="solid")
    center = Alignment(horizontal="center", vertical="center")

    for i, h in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=i, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = center

    examples = [
        [
            "رياضيات أولى ثانوي",
            "ما هو حل المعادلة 2x + 4 = 10؟",
            "MCQ",
            "EASY",
            "المعادلات",
            "2",
            "x=2|x=3*|x=4|x=5",
            "",
            "نطرح 4 من الطرفين: 2x = 6، ثم نقسم على 2: x = 3.",
        ],
        [
            "رياضيات أولى ثانوي",
            "الشمس تشرق من الغرب.",
            "TRUE_FALSE",
            "EASY",
            "معلومات عامة",
            "1",
            "صح|خطأ*",
            "",
            "الشمس تشرق من الشرق وليس الغرب.",
        ],
        [
            "أحياء أولى ثانوي",
            "ما هي عاصمة مصر؟",
            "SHORT_ANSWER",
            "EASY",
            "الجغرافيا",
            "1",
            "",
            "القاهرة,Cairo,مصر",
            "",
        ],
    ]

    for r_idx, row in enumerate(examples, start=2):
        for c_idx, val in enumerate(row, start=1):
            ws.cell(row=r_idx, column=c_idx, value=val).alignment = Alignment(
                vertical="center", wrap_text=True
            )

    widths = [24, 50, 15, 10, 20, 8, 40, 30, 40]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf
