import smtplib

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.exceptions import APIException

from .models import User


class InvitationDeliveryError(APIException):
    status_code = 503
    default_detail = "تعذّر إرسال دعوة التفعيل. لم يتم إنشاء الحساب."
    default_code = "invitation_delivery_failed"


def send_account_invitation(user: User) -> None:
    uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    invitation_url = (
        f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?uidb64={uidb64}&token={token}&invite=1"
    )

    try:
        sent = send_mail(
            subject="دعوة لتفعيل حسابك — منصة التعلم الذكية",
            message=(
                f"مرحبًا {user.first_name or ''},\n\n"
                "تم إنشاء حساب لك على منصة التعلم الذكية. "
                "افتح الرابط التالي لتعيين كلمة مرورك:\n\n"
                f"{invitation_url}\n\n"
                "الرابط صالح لمدة 3 أيام ويُستخدم مرة واحدة. "
                "إذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهل الرسالة."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
    except (OSError, smtplib.SMTPException, ValueError) as exc:
        raise InvitationDeliveryError from exc

    if sent != 1:
        raise InvitationDeliveryError()
