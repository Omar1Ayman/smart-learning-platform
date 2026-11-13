from rest_framework import serializers

from .models import AuditLog

# ---------------------------------------------------------------------------
# Arabic labels for every action emitted via log_action().
#
# IMPORTANT for maintainers: whenever you add a new `log_action(...)` call
# anywhere in the codebase, add its action string here. The fallback in
# `get_action_label()` (below) is a safety net, not a substitute — it shows
# "حدث: <raw-action>" which is Arabic-prefixed but still technically
# English-looking. Users should never see raw action strings.
# ---------------------------------------------------------------------------
ACTION_LABELS = {
    # ---- tenant lifecycle ----
    "tenant.created": "إنشاء مؤسسة",
    "tenant.suspended": "تعليق مؤسسة",
    "tenant.activated": "تفعيل مؤسسة",
    "tenant.settings_updated": "تحديث إعدادات المؤسسة",
    "tenant.branding_updated": "تحديث الهوية البصرية",
    "tenant.exported": "تصدير بيانات المؤسسة",
    # ---- users ----
    "user.logged_in": "تسجيل دخول",
    "user.logged_in_2fa": "تسجيل دخول (بتحقق ثنائي)",
    "user.logged_out": "تسجيل خروج",
    "user.created": "إنشاء مستخدم",
    "user.updated": "تحديث مستخدم",
    "user.deleted": "حذف مستخدم",
    "user.password_changed": "تغيير كلمة المرور",
    "user.profile_updated": "تحديث الملف الشخصي",
    "user.twofa_enabled": "تفعيل المصادقة الثنائية",
    "user.twofa_disabled": "إلغاء المصادقة الثنائية",
    # ---- sessions ----
    "session.revoked": "إنهاء جلسة",
    "session.revoked_all": "إنهاء كل الجلسات",
    # ---- content ----
    "content.created": "إضافة محتوى",
    "content.updated": "تحديث محتوى",
    "content.deleted": "حذف محتوى",
    "content.bulk_deleted": "حذف محتوى جماعي",
    # ---- questions ----
    "question.created": "إضافة سؤال",
    "question.updated": "تحديث سؤال",
    "question.deleted": "حذف سؤال",
    "question.approved": "اعتماد سؤال",
    "question.rejected": "رفض سؤال",
    "question.duplicated": "نسخ سؤال",
    "question_bank.created": "إنشاء بنك أسئلة",
    "question_bank.updated": "تحديث بنك أسئلة",
    "question_bank.deleted": "حذف بنك أسئلة",
    "questions.bulk_imported": "استيراد أسئلة جماعي",
    # ---- curriculum / courses ----
    "curriculum.bulk_imported": "استيراد منهج جماعي",
    "course.duplicated": "نسخ مادة دراسية",
    "students.bulk_imported": "استيراد طلاب جماعي",
    # ---- assessments / attempts ----
    "assessment.created": "إنشاء امتحان",
    "assessment.updated": "تحديث امتحان",
    "assessment.deleted": "حذف امتحان",
    "assessment.published": "نشر امتحان",
    "assessment.duplicated": "نسخ امتحان",
    "assessment.results_exported": "تصدير نتائج امتحان",
    "attempt.reopened": "إعادة فتح محاولة",
    "attempt.voided": "إلغاء محاولة",
    "attempts.bulk_graded": "تصحيح محاولات جماعي",
    # ---- academic year lifecycle ----
    "enrollment.promoted": "ترقية تسجيل",
    "enrollment.transitioned": "نقل بين الترمات",
    "academic_year.created": "إضافة سنة دراسية",
    "academic_year.prepared": "تجهيز سنة دراسية جديدة",
    "academic_year.students_promoted": "ترقية الطلاب",
    "academic_year.archived": "أرشفة سنة دراسية",
    "academic_year.activated": "تفعيل سنة دراسية",
    # ---- attendance ----
    "attendance_session.created": "إنشاء جلسة حضور",
    "attendance_session.opened": "فتح جلسة حضور",
    "attendance_session.closed": "إغلاق جلسة حضور",
    "attendance_session.reopened": "إعادة فتح جلسة حضور",
    "attendance_session.quick_started": "بدء جلسة حضور سريع",
    "attendance_session.bulk_marked": "تحديد حضور جماعي",
    "attendance_session.notify_parents_manual": "إشعار يدوي لأولياء الأمور",
    "attendance_session.started_from_schedule": "بدء حصة من الجدول",
    "group_schedule.created": "إنشاء جدول أسبوعي",
    "group_schedule.updated": "تحديث جدول أسبوعي",
    "group_schedule.deleted": "حذف جدول أسبوعي",
    # ---- platform admin ----
    "platform.tenant_created": "إنشاء مؤسسة (من الإدارة)",
    "platform.owner_password_reset": "إعادة تعيين كلمة سر المالك",
    "platform.tenant_status_lead": "تحويل المؤسسة إلى عميل محتمل",
    "platform.tenant_status_pending": "تحويل المؤسسة إلى قيد المراجعة",
    "platform.tenant_status_trial": "تحويل المؤسسة إلى تجريبية",
    "platform.tenant_status_active": "تفعيل مؤسسة",
    "platform.tenant_status_suspended": "تعليق مؤسسة",
    "platform.tenant_status_churned": "إنهاء اشتراك مؤسسة",
    "platform.user_status_updated": "تحديث حالة مستخدم",
    "platform.plan_created": "إنشاء باقة",
    "platform.plan_updated": "تحديث باقة",
    "platform.subscription_updated": "تحديث اشتراك مؤسسة",
}


# Domain fallbacks — used ONLY when an action isn't in ACTION_LABELS. This
# keeps the UI Arabic even if a developer forgets to add a label, without
# pretending we know the exact verb.
_DOMAIN_FALLBACK = {
    "tenant": "مؤسسة",
    "user": "مستخدم",
    "session": "جلسة",
    "content": "محتوى",
    "question": "سؤال",
    "question_bank": "بنك أسئلة",
    "questions": "أسئلة",
    "assessment": "امتحان",
    "attempt": "محاولة",
    "attempts": "محاولات",
    "academic_year": "سنة دراسية",
    "enrollment": "تسجيل",
    "curriculum": "منهج",
    "course": "مادة دراسية",
    "students": "طلاب",
    "attendance_session": "جلسة حضور",
    "group_schedule": "جدول أسبوعي",
    "platform": "منصة",
}


class AuditLogSerializer(serializers.ModelSerializer):
    actor_email = serializers.SerializerMethodField()
    actor_role = serializers.SerializerMethodField()
    action_label = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "action",
            "action_label",
            "actor",
            "actor_email",
            "actor_role",
            "object_type",
            "object_id",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields

    def get_actor_email(self, obj):
        return obj.actor.email if obj.actor_id else None

    def get_actor_role(self, obj):
        return obj.actor.role if obj.actor_id else None

    def get_action_label(self, obj):
        """Return the Arabic label for this action.

        Order of preference:
          1. Explicit entry in ACTION_LABELS — always correct, contextual,
             grammatically polished.
          2. Domain-based fallback: "مؤسسة: <rest>" for unknown actions.
             Never shows raw English to the user (which is what the old
             `obj.action` fallback did — the bug that surfaced this issue).
          3. Last resort: a generic Arabic label + the action in parens,
             which at least tells the developer (looking at logs) what
             action is missing a label.
        """
        if obj.action in ACTION_LABELS:
            return ACTION_LABELS[obj.action]

        if "." in obj.action:
            domain, _, rest = obj.action.partition(".")
            domain_label = _DOMAIN_FALLBACK.get(domain)
            if domain_label:
                return f"{domain_label}: {rest}"

        return f"حدث ({obj.action})"
