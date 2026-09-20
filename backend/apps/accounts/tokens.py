from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class TenantTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Adds tenant_id/role/email as *advisory* claims for the frontend's
    convenience (e.g. show the tenant name without an extra request).
    The backend never trusts these claims for authorization — every
    permission check re-reads request.user.tenant / request.user.role,
    which SimpleJWT resolves via a fresh DB lookup on every request
    (see SECURITY.md #1)."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["tenant_id"] = str(user.tenant_id) if user.tenant_id else None
        token["role"] = user.role
        token["email"] = user.email
        return token
