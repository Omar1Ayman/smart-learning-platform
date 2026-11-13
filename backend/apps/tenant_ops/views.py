from django.http import HttpResponse
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.academics.models import AcademicYear
from apps.audit.services import log_action
from apps.common.mixins import TenantContextMixin
from apps.common.permissions import IsTenantMember
from apps.tenants.permissions import CanExportTenant, CanImportStudents

from .services import (
    MAX_IMPORT_BYTES,
    REQUIRED_CSV_HEADERS,
    export_to_zip,
    import_students,
    read_or_get_rows_for_validation,
    validate_student_rows,
)


class TenantExportView(TenantContextMixin, APIView):
    """GET /tenant/export/ — download full tenant archive as ZIP."""

    permission_classes = [IsAuthenticated, IsTenantMember, CanExportTenant]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "tenant_export"

    def get(self, request):
        buf = export_to_zip(request.tenant)
        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="tenant.exported",
        )
        response = HttpResponse(buf.read(), content_type="application/zip")
        filename = f"tenant-{request.tenant.slug}-export.zip"
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class StudentImportTemplateView(TenantContextMixin, APIView):
    """GET /tenant/import/template/ — downloadable CSV template."""

    permission_classes = [IsAuthenticated, IsTenantMember, CanImportStudents]

    def get(self, request):
        csv_content = (
            "\ufeff"  # BOM for Excel
            "email,first_name,last_name,group_name\n"
            "student1@example.com,أحمد,محمد,1ث - أ\n"
            "student2@example.com,فاطمة,علي,1ث - أ\n"
        ).encode("utf-8")
        response = HttpResponse(csv_content, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = 'attachment; filename="students_template.csv"'
        return response


class StudentImportView(TenantContextMixin, APIView):
    """POST /tenant/import/students/

    Form fields:
      - file: CSV or XLSX
      - academic_year: UUID of AcademicYear
      - dry_run: 'true' for preview, otherwise commit
    """

    permission_classes = [IsAuthenticated, IsTenantMember, CanImportStudents]
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "student_import"

    def post(self, request):
        from apps.billing.services import require_feature

        require_feature(request.tenant, "bulk_import")
        upload = request.FILES.get("file")
        academic_year_id = request.data.get("academic_year")
        dry_run = str(request.data.get("dry_run", "false")).lower() in ("true", "1", "yes")

        if upload is None:
            return Response(
                {"error": {"status": 400, "detail": "ملف Excel أو CSV مطلوب."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # H-10: check size BEFORE .read() so we never pull a 500MB file
        # into memory. `upload.size` is available without reading the
        # content — it's set from the multipart boundary.
        if upload.size > MAX_IMPORT_BYTES:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": (
                            f"حجم الملف ({upload.size // (1024 * 1024)} ميجابايت) "
                            f"يتجاوز الحد المسموح "
                            f"({MAX_IMPORT_BYTES // (1024 * 1024)} ميجابايت)."
                        ),
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not academic_year_id:
            return Response(
                {"error": {"status": 400, "detail": "السنة الدراسية مطلوبة."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        academic_year = (
            AcademicYear.objects.for_tenant(request.tenant).filter(id=academic_year_id).first()
        )
        if academic_year is None:
            return Response(
                {"error": {"status": 404, "detail": "السنة الدراسية غير موجودة."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            rows = read_or_get_rows_for_validation(upload.read())
        except Exception as exc:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": f"تعذّر قراءة الملف: {exc}",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not rows:
            return Response(
                {"error": {"status": 400, "detail": "الملف فارغ أو لا يحتوي على بيانات."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sample = rows[0]
        missing = REQUIRED_CSV_HEADERS - set(sample.keys())
        if missing:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": f"الأعمدة الناقصة: {', '.join(sorted(missing))}",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        analysis = validate_student_rows(request.tenant, academic_year, rows)

        summary = {
            "total": len(analysis),
            "valid": sum(1 for r in analysis if r["status"] == "valid"),
            "skipped": sum(1 for r in analysis if r["status"] == "skip"),
            "errors": sum(1 for r in analysis if r["status"] == "error"),
        }

        if dry_run:
            return Response({"dry_run": True, "summary": summary, "rows": analysis})

        # Commit path: only proceed if there are zero errors.
        if summary["errors"] > 0:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": (
                            f"لا يمكن الاستيراد — {summary['errors']} سطر به أخطاء. "
                            "صحّح الملف وأعد المحاولة."
                        ),
                    },
                    "summary": summary,
                    "rows": analysis,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = import_students(request.tenant, academic_year, analysis)
        except ValueError as exc:
            # M-11: a row failed at commit time (race with another import).
            return Response(
                {"error": {"status": 400, "detail": str(exc)}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        log_action(
            actor=request.user,
            tenant=request.tenant,
            action="students.bulk_imported",
            metadata={
                "academic_year": academic_year.name,
                **result,
            },
        )
        return Response(
            {"dry_run": False, "summary": summary, "result": result},
            status=status.HTTP_201_CREATED,
        )
