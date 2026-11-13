from django.apps import AppConfig


class TenantOpsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.tenant_ops"
    label = "tenant_ops"