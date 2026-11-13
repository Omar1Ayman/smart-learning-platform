from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    type_label = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            "id",
            "type",
            "type_label",
            "title",
            "message",
            "link",
            "is_read",
            "created_at",
        ]
        read_only_fields = fields

    def get_type_label(self, obj) -> str:
        return obj.get_type_display()