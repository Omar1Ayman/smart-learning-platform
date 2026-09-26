from django.http import FileResponse, Http404
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import User
from apps.common.permissions import IsCreatorOrAdmin, IsStaffForWriteActions
from apps.common.views import TenantScopedViewSet

from .models import Content
from .serializers import ContentSerializer
from .services import visible_content_for_student


class ContentViewSet(TenantScopedViewSet):
    """Read visibility is role-scoped, same principle as Enrollment
    (SECURITY.md §1): OWNER/ADMIN/TEACHER see everything in the tenant
    today (tightening Teacher visibility further, e.g. to only their
    assigned courses, is a documented known limitation — see
    PROJECT_MEMORY.md §15); STUDENT sees only content that matches their
    *current* academic context on every scope field the row actually
    sets (apps/content/services.py) — this is the literal implementation
    of spec #27's cross-group visibility example."""

    queryset = Content.objects.all()
    serializer_class = ContentSerializer
    permission_classes = TenantScopedViewSet.permission_classes + [IsStaffForWriteActions, IsCreatorOrAdmin]
    filterset_fields = ["content_type", "grade", "subject", "course", "chapter", "lesson", "is_published"]

    def get_queryset(self):
        if self.request.user.role == User.Role.STUDENT:
            return visible_content_for_student(self.request.tenant, self.request.user)
        return super().get_queryset()

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        """The *only* sanctioned way to read a Content row's payload.
        Deliberately re-runs the exact same get_object() (queryset +
        object-permission chain) the detail view uses — there is no
        direct /media/... URL handed to the client anywhere in this
        codebase, precisely so a private file can never be reached by
        guessing or leaking a path, only through this permission-checked
        endpoint (spec #78, 'Access control' / 'Private/public
        visibility')."""
        content = self.get_object()

        if content.file:
            if not content.file.storage.exists(content.file.name):
                raise Http404("الملف غير موجود.")
            return FileResponse(
                content.file.open("rb"),
                as_attachment=True,
                filename=content.original_filename or content.file.name,
            )
        if content.external_url:
            return Response({"external_url": content.external_url})
        return Response({"text_body": content.text_body})
