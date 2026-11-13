"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ErrorState, Spinner } from "@/components/ui/States";
import {
  getTenantBranding,
  getTenantSettings,
  updateTenantBranding,
  updateTenantSettings,
} from "@/lib/api/tenantSettings";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import type { TenantBranding, TenantPermissions, TenantSettings } from "@/types";
import { useAuthStore } from "@/lib/auth/store";

const SECTION_NAV = [
  { id: "branding", label: "الهوية البصرية", icon: "🎨" },
  { id: "exam", label: "الامتحانات", icon: "📝" },
  { id: "question", label: "الأسئلة", icon: "❓" },
  { id: "content", label: "المحتوى", icon: "📚" },
  { id: "notification", label: "الإشعارات", icon: "🔔" },
  { id: "permissions", label: "الصلاحيات", icon: "🛡️" },
];

const PERMISSION_GROUPS: {
  title: string;
  options: { key: keyof TenantPermissions; label: string; description: string }[];
}[] = [
  {
    title: "صلاحيات المعلمين",
    options: [
      { key: "teachers_can_create_assessments", label: "إنشاء الامتحانات", description: "السماح للمعلمين بإنشاء امتحانات." },
      { key: "teachers_can_delete_own_assessments", label: "حذف امتحاناتهم", description: "السماح للمعلمين بحذف الامتحانات التي أنشؤوها." },
      { key: "teachers_can_view_all_student_results", label: "عرض نتائج جميع الامتحانات", description: "السماح برؤية نتائج امتحانات المعلمين الآخرين." },
      { key: "teachers_can_create_questions", label: "إنشاء الأسئلة", description: "السماح للمعلمين بإضافة أسئلة إلى بنك المؤسسة." },
      { key: "teachers_can_mark_attendance", label: "إدارة الحضور", description: "السماح بإنشاء جلسات الحضور وإدارتها." },
      { key: "teachers_can_import_students", label: "استيراد الطلاب", description: "السماح باستيراد الطلاب من الملفات." },
      { key: "teachers_can_export_data", label: "تصدير بيانات المؤسسة", description: "السماح بتنزيل نسخة بيانات المؤسسة." },
      { key: "teachers_can_manage_own_content", label: "إدارة محتواهم", description: "السماح بإضافة وتعديل وحذف المحتوى الذي أنشأه المعلم." },
      { key: "teachers_can_publish_content_directly", label: "نشر المحتوى مباشرة", description: "السماح بنشر المحتوى دون مراجعة مسؤول." },
      { key: "teachers_can_delete_others_content", label: "حذف محتوى المعلمين الآخرين", description: "السماح بحذف محتوى أنشأه معلم آخر." },
    ],
  },
  {
    title: "صلاحيات المسؤولين",
    options: [
      { key: "admins_can_manage_teachers", label: "إدارة حسابات المعلمين وتكليفاتهم", description: "السماح بإضافة المعلمين وتعديلهم وإدارة تكليفاتهم." },
      { key: "admins_can_delete_assessments", label: "حذف الامتحانات", description: "السماح للمسؤول بحذف الامتحانات." },
      { key: "admins_can_approve_questions", label: "اعتماد الأسئلة", description: "السماح للمسؤول بمراجعة الأسئلة واعتمادها أو رفضها." },
      { key: "admins_can_export_data", label: "تصدير بيانات المؤسسة", description: "السماح للمسؤول بتنزيل نسخة بيانات المؤسسة." },
      { key: "admins_can_view_billing", label: "عرض الفوترة والاستخدام", description: "السماح للمسؤول بعرض الاشتراك والحدود والاستخدام." },
      { key: "admins_can_manage_settings", label: "إدارة إعدادات المؤسسة", description: "السماح للمسؤول بتعديل السياسات والهوية البصرية." },
    ],
  },
  {
    title: "صلاحيات إضافية",
    options: [
      { key: "enable_audit_log_for_teachers", label: "إتاحة سجل التدقيق للمعلمين", description: "السماح للمعلمين بقراءة سجل أحداث المؤسسة." },
      { key: "enable_bulk_import", label: "تفعيل الاستيراد الجماعي", description: "تفعيل استيراد الملفات للمسؤولين." },
    ],
  },
];

export default function TenantSettingsPage() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);

  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const [originalSettings, setOriginalSettings] = useState<TenantSettings | null>(null);
  const [originalBranding, setOriginalBranding] = useState<TenantBranding | null>(null);
  const isReadOnly =
    role !== "OWNER" &&
    !(role === "ADMIN" && originalSettings?.permissions.admins_can_manage_settings);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["tenant-settings"],
    queryFn: getTenantSettings,
  });
  const { data: brandingData } = useQuery({
    queryKey: ["tenant-branding"],
    queryFn: getTenantBranding,
  });

  useEffect(() => {
    if (data) {
      setSettings(data);
      setOriginalSettings(JSON.parse(JSON.stringify(data)));
    }
  }, [data]);

  useEffect(() => {
    if (brandingData) {
      setBranding(brandingData);
      setOriginalBranding(JSON.parse(JSON.stringify(brandingData)));
    }
  }, [brandingData]);

  // كشف التغييرات غير المحفوظة
  const hasUnsavedChanges = useMemo(() => {
    if (!settings || !originalSettings || !branding || !originalBranding) return false;
    return (
      JSON.stringify(settings) !== JSON.stringify(originalSettings) ||
      JSON.stringify(branding) !== JSON.stringify(originalBranding)
    );
  }, [settings, originalSettings, branding, originalBranding]);

  // تحذير قبل إغلاق الصفحة
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!settings || !branding) return;
      await updateTenantBranding({
        primary_color: branding.primary_color,
        logo_url: branding.logo_url,
        contact_email: branding.contact_email,
      });
      await updateTenantSettings({
        exam_policy: settings.exam_policy,
        question_policy: settings.question_policy,
        content_policy: settings.content_policy,
        notification_policy: settings.notification_policy,
        permissions: settings.permissions,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-settings"] });
      queryClient.invalidateQueries({ queryKey: ["tenant-branding"] });
      if (settings) setOriginalSettings(JSON.parse(JSON.stringify(settings)));
      if (branding) setOriginalBranding(JSON.parse(JSON.stringify(branding)));
      toastSuccess("تم حفظ جميع التغييرات بنجاح");
    },
    onError: (err) => toastError(err, "تعذّر حفظ التغييرات."),
  });

  // اختصار Ctrl+S / Cmd+S للحفظ
  useEffect(() => {
    if (isReadOnly || !hasUnsavedChanges) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveMutation.mutate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hasUnsavedChanges, isReadOnly, saveMutation]);

  function discardChanges() {
    if (originalSettings) setSettings(JSON.parse(JSON.stringify(originalSettings)));
    if (originalBranding) setBranding(JSON.parse(JSON.stringify(originalBranding)));
    toastSuccess("تم التراجع عن التغييرات");
  }

  if (role !== "OWNER" && role !== "ADMIN") {
    return <ErrorState message="هذا القسم متاح فقط لمالك المؤسسة والمسؤولين." />;
  }

  if (isLoading || !settings || !branding) return <Spinner />;
  if (isError) return <ErrorState message="تعذّر تحميل الإعدادات." />;

  return (
    <div className="flex flex-col gap-6 pb-24">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-ink">إعدادات المؤسسة</h1>
          <p className="mt-1 text-sm text-ink-400">
            تحكم كامل في سياسات الامتحانات والأسئلة والمحتوى والهوية البصرية.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
            isReadOnly ? "bg-info/10 text-info" : "bg-success/10 text-success"
          }`}
        >
          {isReadOnly ? "👁️ وضع القراءة فقط" : "✏️ وضع التحرير الكامل"}
        </span>
      </div>

      {/* Read-only banner */}
      {isReadOnly && (
        <div className="rounded-xl border border-info/30 bg-info/5 p-4 flex items-start gap-3">
          <span className="text-2xl">🔒</span>
          <div>
            <p className="text-sm font-semibold text-info">وضع القراءة فقط</p>
            <p className="mt-1 text-xs text-ink-700 leading-relaxed">
              يمكنك الاطلاع على جميع السياسات والهوية البصرية للمؤسسة. تعديل هذه
              الإعدادات متاح للمالك، وللمسؤول إذا فعّل المالك صلاحية إدارة الإعدادات.
            </p>
          </div>
        </div>
      )}

      {/* Section Navigation */}
      <div className="sticky top-0 z-20 -mx-2 px-2 py-2 bg-paper/95 backdrop-blur-sm border-b border-line">
        <div className="flex flex-wrap gap-2">
          {SECTION_NAV.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper-elevated px-3 py-1.5 text-xs font-medium text-ink-600 hover:border-accent/40 hover:text-accent-dark transition-colors"
            >
              <span>{s.icon}</span>
              {s.label}
            </a>
          ))}
        </div>
      </div>

      {/* Grid Content */}
      <div className="grid gap-6 lg:grid-cols-2">
       {/* ============ Branding ============ */}
<section id="branding" className="card p-6 lg:col-span-2 scroll-mt-24">
  <div className="flex items-start gap-3 mb-4">
    <span className="text-2xl">🏫</span>
    <div>
      <h2 className="text-lg font-bold font-display text-ink">بيانات المؤسسة والهوية البصرية</h2>
      <p className="text-xs text-ink-400">
        تظهر هذه البيانات للمستخدمين في كل مكان بالمنصة.
      </p>
    </div>
  </div>

  {/* تنبيه بتأثير تغيير الاسم */}
  <div className="mb-4 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-ink-700">
    ⚠️ <strong>تنبيه:</strong> تغيير اسم المؤسسة سيظهر فوراً في الـ Sidebar والـ Topbar وجميع الإيميلات.
  </div>

  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <div className="sm:col-span-2 lg:col-span-1">
      <Input
        label="اسم المؤسسة"
        value={branding.name}
        onChange={(e) => setBranding({ ...branding, name: e.target.value })}
        placeholder="مدرسة النيل الدولية"
        disabled={isReadOnly}
      />
    </div>
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-ink-700">اللون الأساسي</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={branding.primary_color}
          onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
          disabled={isReadOnly}
          className="h-10 w-14 cursor-pointer rounded-lg border border-line disabled:cursor-not-allowed disabled:opacity-50"
        />
        <input
          type="text"
          value={branding.primary_color}
          onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })}
          disabled={isReadOnly}
          className="flex-1 rounded-lg border border-line px-3 py-2 text-sm font-mono disabled:bg-ink-50 disabled:text-ink-400"
        />
      </div>
    </div>
    <Input
      label="رابط اللوجو"
      value={branding.logo_url}
      onChange={(e) => setBranding({ ...branding, logo_url: e.target.value })}
      placeholder="https://..."
      disabled={isReadOnly}
    />
    <Input
      label="بريد التواصل"
      type="email"
      value={branding.contact_email}
      onChange={(e) => setBranding({ ...branding, contact_email: e.target.value })}
      disabled={isReadOnly}
    />
  </div>

  {/* Live Preview محدث */}
  <div className="mt-5 rounded-xl border border-line p-4 bg-ink-50/30">
    <p className="text-xs font-medium text-ink-500 mb-2">معاينة مباشرة</p>
    <div className="flex items-center gap-3">
      <div
        className="h-10 w-10 rounded-lg shadow-sm flex items-center justify-center text-white font-bold"
        style={{ backgroundColor: branding.primary_color }}
      >
        {branding.name?.charAt(0) || "ت"}
      </div>
      <div>
        <p className="text-sm font-bold text-ink">{branding.name || "اسم المؤسسة"}</p>
        <p className="text-xs text-ink-400">{branding.contact_email || "contact@example.com"}</p>
      </div>
    </div>
  </div>
</section>

        {/* ============ Exam Policy ============ */}
        <section id="exam" className="card p-6 scroll-mt-24">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-2xl">📝</span>
            <div>
              <h2 className="text-lg font-bold font-display text-ink">سياسات الامتحانات</h2>
              <p className="text-xs text-ink-400">تنطبق على كل الامتحانات في المؤسسة.</p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Toggle
              label="السماح بإعادة المحاولة"
              description="إذا كان مغلقًا، الطالب يستطيع أداء كل امتحان مرة واحدة فقط"
              checked={settings.exam_policy.allow_retakes}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  exam_policy: { ...settings.exam_policy, allow_retakes: v },
                })
              }
              disabled={isReadOnly}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink-700">عدد المحاولات الافتراضي</label>
              <input
                type="number"
                min={1}
                max={20}
                value={settings.exam_policy.max_attempts_default}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    exam_policy: {
                      ...settings.exam_policy,
                      max_attempts_default: parseInt(e.target.value) || 2,
                    },
                  })
                }
                disabled={isReadOnly}
                className="w-32 px-3 py-2 text-sm border rounded-lg border-line disabled:bg-ink-50 disabled:text-ink-400"
              />
            </div>

            <Toggle
              label="فرض الشاشة الكاملة"
              description="الطالب لا يستطيع متابعة الامتحان بدون وضع الشاشة الكاملة"
              checked={settings.exam_policy.force_fullscreen}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  exam_policy: { ...settings.exam_policy, force_fullscreen: v },
                })
              }
              disabled={isReadOnly}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink-700">
                تسليم تلقائي بعد X تبديل نافذة
              </label>
              <p className="text-xs text-ink-400">0 = معطّل</p>
              <input
                type="number"
                min={0}
                max={20}
                value={settings.exam_policy.auto_submit_after_tab_switches}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    exam_policy: {
                      ...settings.exam_policy,
                      auto_submit_after_tab_switches: parseInt(e.target.value) || 0,
                    },
                  })
                }
                disabled={isReadOnly}
                className="w-32 px-3 py-2 text-sm border rounded-lg border-line disabled:bg-ink-50 disabled:text-ink-400"
              />
            </div>

            <Toggle
              label="إظهار الإجابات الصحيحة بعد التسليم"
              checked={settings.exam_policy.show_correct_answers_after_submit}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  exam_policy: { ...settings.exam_policy, show_correct_answers_after_submit: v },
                })
              }
              disabled={isReadOnly}
            />

            <Toggle
              label="المدرسون يستطيعون النشر مباشرة"
              description="إذا كان مغلقًا، يحتاج المدرس اعتماد المدير"
              checked={settings.exam_policy.teachers_can_self_publish}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  exam_policy: { ...settings.exam_policy, teachers_can_self_publish: v },
                })
              }
              disabled={isReadOnly}
            />

            <Toggle
              label="خلط الأسئلة افتراضيًا"
              checked={settings.exam_policy.shuffle_questions_default}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  exam_policy: { ...settings.exam_policy, shuffle_questions_default: v },
                })
              }
              disabled={isReadOnly}
            />

            <Toggle
              label="خلط الخيارات افتراضيًا"
              checked={settings.exam_policy.shuffle_options_default}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  exam_policy: { ...settings.exam_policy, shuffle_options_default: v },
                })
              }
              disabled={isReadOnly}
            />
          </div>
        </section>

        {/* ============ Question Policy ============ */}
        <section id="question" className="card p-6 scroll-mt-24">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-2xl">❓</span>
            <div>
              <h2 className="text-lg font-bold font-display text-ink">سياسات الأسئلة</h2>
              <p className="text-xs text-ink-400">تحكم في workflow المراجعة للأسئلة.</p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Toggle
              label="الأسئلة تحتاج مراجعة"
              description="إذا كان مغلقًا، كل الأسئلة تُعتمد تلقائيًا عند الإنشاء"
              checked={settings.question_policy.require_review}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  question_policy: { ...settings.question_policy, require_review: v },
                })
              }
              disabled={isReadOnly}
            />
            <Toggle
              label="المالك والمسؤول يعتمدون أسئلتهم مباشرة"
              description="إذا كان مغلقًا، حتى المالك يحتاج معتمد آخر"
              checked={settings.question_policy.owners_can_self_approve}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  question_policy: { ...settings.question_policy, owners_can_self_approve: v },
                })
              }
              disabled={isReadOnly}
            />
          </div>
        </section>

        {/* ============ Content Policy ============ */}
        <section id="content" className="card p-6 scroll-mt-24">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-2xl">📚</span>
            <div>
              <h2 className="text-lg font-bold font-display text-ink">سياسات المحتوى</h2>
              <p className="text-xs text-ink-400">تحكم في صلاحيات المحتوى والملفات.</p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Toggle
              label="المدرسون يعدلون محتوى بعضهم"
              description="إذا كان مغلقًا، كل مدرس يتحكم فقط في محتواه"
              checked={settings.content_policy.teachers_can_edit_others_content}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  content_policy: { ...settings.content_policy, teachers_can_edit_others_content: v },
                })
              }
              disabled={isReadOnly}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink-700">
                الحد الأقصى لحجم الملف (ميجابايت)
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={settings.content_policy.max_file_size_mb}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    content_policy: {
                      ...settings.content_policy,
                      max_file_size_mb: parseInt(e.target.value) || 50,
                    },
                  })
                }
                disabled={isReadOnly}
                className="w-32 px-3 py-2 text-sm border rounded-lg border-line disabled:bg-ink-50 disabled:text-ink-400"
              />
            </div>
          </div>
        </section>

        {/* ============ Notification Policy ============ */}
        <section id="notification" className="card p-6 scroll-mt-24">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-2xl">🔔</span>
            <div>
              <h2 className="text-lg font-bold font-display text-ink">الإشعارات</h2>
              <p className="text-xs text-ink-400">تحكم في إرسال الإشعارات عبر البريد.</p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Toggle
              label="إشعار عند نشر امتحان"
              checked={settings.notification_policy.email_on_exam_publish}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  notification_policy: { ...settings.notification_policy, email_on_exam_publish: v },
                })
              }
              disabled={isReadOnly}
            />
            <Toggle
              label="إشعار عند صدور نتيجة"
              checked={settings.notification_policy.email_on_result}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  notification_policy: { ...settings.notification_policy, email_on_result: v },
                })
              }
              disabled={isReadOnly}
            />
          </div>
        </section>

        {/* ============ Role Permissions ============ */}
        <section id="permissions" className="card p-6 lg:col-span-2 scroll-mt-24">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-2xl">🛡️</span>
            <div>
              <h2 className="text-lg font-bold font-display text-ink">صلاحيات الأدوار</h2>
              <p className="text-xs text-ink-400">
                تحكم في الإجراءات المتاحة للمعلمين والمسؤولين. المالك يحتفظ دائمًا بكامل الصلاحيات.
              </p>
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.title} className="flex flex-col gap-3">
                <h3 className="text-sm font-bold text-ink-700">{group.title}</h3>
                {group.options.map((option) => (
                  <Toggle
                    key={option.key}
                    label={option.label}
                    description={option.description}
                    checked={settings.permissions[option.key]}
                    onChange={(value) =>
                      setSettings({
                        ...settings,
                        permissions: { ...settings.permissions, [option.key]: value },
                      })
                    }
                    disabled={isReadOnly}
                  />
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Sticky Save Bar (يظهر فقط عند وجود تغييرات) */}
      {hasUnsavedChanges && !isReadOnly && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-in-up">
          <div className="flex items-center gap-4 rounded-2xl border border-line bg-paper-elevated px-5 py-3 shadow-2xl">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              <p className="text-sm font-semibold text-ink">لديك تغييرات غير محفوظة</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={discardChanges} disabled={saveMutation.isPending}>
                إلغاء
              </Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "جارٍ الحفظ..." : "حفظ الكل (⌘S)"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Toggle Component
// ============================================================================

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start justify-between gap-4 rounded-lg border border-line bg-white p-3 transition-colors ${
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer hover:bg-ink-50/30"
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {description && <p className="mt-0.5 text-xs text-ink-400">{description}</p>}
      </div>
      <div className="relative shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
          disabled={disabled}
        />
        <div className="h-6 transition-colors rounded-full w-11 bg-ink-100 peer-checked:bg-ink peer-disabled:opacity-50" />
        <div className="absolute end-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform peer-checked:-translate-x-5" />
      </div>
    </label>
  );
}