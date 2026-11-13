from rest_framework import status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ReadOnlyModelViewSet

from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(ReadOnlyModelViewSet):
    """Read-only + mark-read + bulk-delete notifications.

    A user only ever sees their own notifications — enforced by the
    queryset, not a permission class, so guessing an ID returns 404
    rather than 403 (attacker learns nothing about whether the ID exists).

    Batch 12 (Milestone 3): added
      - `?type__in=A,B,C` filter (comma-separated notification types)
      - POST /notifications/bulk_delete/  body: {ids: [...]}
      - POST /notifications/<id>/mark_unread/ — undo a mark-read
    """

    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post"]

    def get_queryset(self):
        qs = Notification.objects.filter(user=self.request.user)

        # Batch 12: type__in filter (comma-separated list).
        type_in = self.request.query_params.get("type__in")
        if type_in:
            types = [t.strip() for t in type_in.split(",") if t.strip()]
            if types:
                qs = qs.filter(type__in=types)

        return qs

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        """Mark a single notification as read."""
        n = self.get_object()
        if not n.is_read:
            n.is_read = True
            n.save(update_fields=["is_read"])
        return Response(self.get_serializer(n).data)

    @action(detail=True, methods=["post"], url_path="mark_unread")
    def mark_unread(self, request, pk=None):
        """Batch 12: undo an accidental mark-as-read."""
        n = self.get_object()
        if n.is_read:
            n.is_read = False
            n.save(update_fields=["is_read"])
        return Response(self.get_serializer(n).data)

    @action(detail=False, methods=["post"])
    def mark_all_read(self, request):
        """Mark every unread notification as read."""
        count = Notification.objects.filter(user=request.user, is_read=False).update(
            is_read=True
        )
        return Response({"marked_read": count})

    @action(detail=False, methods=["get"])
    def unread_count(self, request):
        count = Notification.objects.filter(user=request.user, is_read=False).count()
        return Response({"count": count})

    @action(detail=False, methods=["post"], url_path="bulk_delete")
    def bulk_delete(self, request):
        """Batch 12: delete a batch of the caller's own notifications.

        Scope is enforced at the queryset level — a malicious caller
        passing someone else's IDs simply gets those IDs silently
        ignored (never deleted, never leaked as "not found" vs "exists").
        """
        ids = request.data.get("ids")
        if not isinstance(ids, list) or not ids:
            return Response(
                {"error": {"status": 400, "detail": "يجب اختيار إشعار واحد على الأقل."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(ids) > 100:
            return Response(
                {
                    "error": {
                        "status": 400,
                        "detail": "الحد الأقصى 100 إشعار في الدفعة الواحدة.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Only own notifications are visible — others are silently ignored.
        deleted_qs = Notification.objects.filter(user=request.user, id__in=ids)
        count = deleted_qs.count()
        deleted_qs.delete()

        return Response({"deleted": count})