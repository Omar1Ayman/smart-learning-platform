"""
Phase 1.1 — Canonical feature and limit keys.

This module is the single source of truth. Add a feature here FIRST,
then reference it everywhere else. Do NOT hardcode the strings inline.

Each key must:
  - exist in every Plan's `features` dict (or default to False),
  - be referenced in backend `require_feature()` calls,
  - have a corresponding UI gate in the frontend.
"""

from typing import TypedDict


class FeatureInfo(TypedDict):
    label: str
    description: str
    icon: str


class LimitInfo(TypedDict):
    label: str
    description: str
    unit: str


# ============================================================================
# Feature catalog
# ============================================================================

FEATURES: dict[str, FeatureInfo] = {
    "bulk_grading": {
        "label": "تصحيح جماعي",
        "description": "تصحيح عدة محاولات امتحان في طلب واحد",
        "icon": "📊",
    },
    "advanced_analytics": {
        "label": "تحليلات متقدمة",
        "description": "توزيع الدرجات، أصعب/أسهل الأسئلة، معدل النجاح",
        "icon": "📈",
    },
    "parent_portal": {
        "label": "بوابة أولياء الأمور",
        "description": "حساب مخصص لأولياء الأمور لمتابعة أبنائهم",
        "icon": "👨‍👩‍👧",
    },
    "custom_branding": {
        "label": "تخصيص الهوية البصرية",
        "description": "شعار وألوان المؤسسة الخاصة",
        "icon": "🎨",
    },
    "bulk_import": {
        "label": "استيراد البيانات دفعة واحدة",
        "description": "استيراد الأسئلة، الطلاب، والمنهج من Excel/CSV",
        "icon": "📥",
    },
    "attendance": {
        "label": "نظام الحضور والغياب",
        "description": "تسجيل الحضور عبر QR، باركود، أو يدويًا",
        "icon": "✓",
    },
    "api_access": {
        "label": "الوصول عبر API",
        "description": "تكامل مؤسستك مع أنظمتك الأخرى عبر API",
        "icon": "🔌",
    },
    "priority_support": {
        "label": "دعم أولوية",
        "description": "استجابة خلال 2 ساعات في أيام العمل",
        "icon": "⭐",
    },
}


# ============================================================================
# Limit catalog
# ============================================================================

LIMITS: dict[str, LimitInfo] = {
    "max_students": {
        "label": "الطلاب",
        "description": "الحد الأقصى لعدد حسابات الطلاب",
        "unit": "طالب",
    },
    "max_teachers": {
        "label": "المعلمون",
        "description": "الحد الأقصى لعدد حسابات المعلمين",
        "unit": "معلم",
    },
    "max_storage_mb": {
        "label": "التخزين",
        "description": "مساحة التخزين للملفات والفيديوهات",
        "unit": "MB",
    },
    "max_assessments_per_month": {
        "label": "الامتحانات الشهرية",
        "description": "عدد الامتحانات التي يمكن إنشاؤها شهريًا",
        "unit": "امتحان",
    },
}


# ============================================================================
# Helpers
# ============================================================================


def is_valid_feature(key: str) -> bool:
    return key in FEATURES


def is_valid_limit(key: str) -> bool:
    return key in LIMITS


def all_feature_keys() -> list[str]:
    return list(FEATURES.keys())


def all_limit_keys() -> list[str]:
    return list(LIMITS.keys())
