from .models import AuditLog


def log_action(actor=None, tenant=None, action="", obj=None, metadata=None):
    """One call-site pattern reused everywhere an important action happens.
    Never raises — a logging failure must never break the request it's
    logging (best-effort, matching how memory/observability writes are
    treated elsewhere in this stack)."""
    try:
        AuditLog.objects.create(
            actor=actor,
            tenant=tenant,
            action=action,
            object_type=obj.__class__.__name__ if obj is not None else "",
            object_id=str(getattr(obj, "id", "")) if obj is not None else "",
            metadata=metadata or {},
        )
    except Exception:  # noqa: BLE001 — audit logging must never break the caller
        pass
