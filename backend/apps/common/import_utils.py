"""Wave D1b — shared CSV/XLSX reader for import services.

Both `apps.questions.import_service` and `apps.academics.import_service`
need the same low-level parsing. Keeping one implementation here means:
  - a fix to (say) the "unquoted comma" detection lands everywhere,
  - the size cap can't drift between two copies,
  - future import types (students already exists in `tenant_ops`) can
    adopt the same behavior by importing this module.
"""

import csv
import io

MAX_IMPORT_BYTES = 10 * 1024 * 1024  # 10 MB — ~50k rows of CSV


def read_rows(raw_bytes: bytes) -> list[dict]:
    """Detect CSV vs XLSX, return list of dicts with lowercase headers.

    CSV parsing is defensive: a row with more values than headers is
    rejected with a friendly error instead of silently mangling the
    data (`DictReader` would stash the extras under the `None` key,
    which downstream code then tries `.strip()` on a list — boom).

    XLSX uses openpyxl in read-only mode (streams rows, no full workbook
    in memory). Both paths yield the same shape.
    """
    if len(raw_bytes) > MAX_IMPORT_BYTES:
        raise ValueError(
            f"حجم الملف ({len(raw_bytes) // (1024 * 1024)} ميجابايت) يتجاوز "
            f"الحد المسموح ({MAX_IMPORT_BYTES // (1024 * 1024)} ميجابايت)."
        )

    if raw_bytes[:4] == b"PK\x03\x04":  # XLSX (zip signature)
        return _read_xlsx(raw_bytes)
    return _read_csv(raw_bytes)


def _read_csv(raw_bytes: bytes) -> list[dict]:
    try:
        text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw_bytes.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    rows: list[dict] = []
    for idx, r in enumerate(reader, start=2):
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
