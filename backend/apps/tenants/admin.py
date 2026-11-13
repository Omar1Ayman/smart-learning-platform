"""Tenant admin lives in apps/platform_admin/admin.py — that version has
lifecycle actions + platform fields. This file exists only so the tenants
app still declares its admin module cleanly if something imports it
directly. Registering here would conflict with the platform version."""

# Intentionally no @admin.register calls. See
# apps/platform_admin/admin.py for TenantPlatformAdmin + DemoRequestAdmin.
