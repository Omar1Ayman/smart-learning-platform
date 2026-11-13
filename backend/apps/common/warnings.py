"""Non-blocking warnings for serializers.

Usage in a serializer:

    class MySerializer(WarningSerializerMixin, ModelSerializer):
        def validate(self, attrs):
            attrs = super().validate(attrs)
            if some_condition:
                self.add_warning("field_name", "هذه رسالة تحذير")
            return attrs

Then in the viewset (TenantScopedViewSet handles this automatically):
    response.data["_warnings"] = serializer.get_warnings()

The frontend should render `_warnings` as a banner (yellow), NOT as
inline field errors (red). The request succeeded; the warning is a
heads-up about a state that may surprise the user.
"""


class WarningSerializerMixin:
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._warnings: dict[str, list[str]] = {}

    def add_warning(self, field: str, message: str) -> None:
        self._warnings.setdefault(field, []).append(message)

    def get_warnings(self) -> dict[str, list[str]]:
        return self._warnings