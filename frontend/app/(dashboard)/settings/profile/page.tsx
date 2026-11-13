"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ErrorState, Spinner } from "@/components/ui/States";
import { getProfile, updateProfile } from "@/lib/api/profile";
import { getStudentDetail, getTeacherDetail } from "@/lib/api/profiles";
import { useAuthStore } from "@/lib/auth/store";
import { toastError, toastSuccess } from "@/lib/utils/toast";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "مالك المؤسسة",
  ADMIN: "مسؤول",
  TEACHER: "معلّم",
  STUDENT: "طالب",
  PARENT: "ولي أمر",
};

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const [draft, setDraft] = useState<{
    first_name: string;
    last_name: string;
  } | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["auth", "profile"],
    queryFn: getProfile,
  });

  const firstName = draft?.first_name ?? data?.first_name ?? "";
  const lastName = draft?.last_name ?? data?.last_name ?? "";

  const mutation = useMutation({
    mutationFn: () => updateProfile({ first_name: firstName.trim(), last_name: lastName.trim() }),
    onSuccess: (updated) => {
      setDraft(null);
      queryClient.setQueryData(["auth", "profile"], updated);
      queryClient.invalidateQueries({ queryKey: ["auth", "profile"] });
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        setUser({ ...currentUser, first_name: updated.first_name, last_name: updated.last_name });
      }
      toastSuccess("تم تحديث الملف الشخصي بنجاح");
    },
    onError: (err) => toastError(err, "تعذّر تحديث الملف الشخصي."),
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message="تعذّر تحميل الملف الشخصي." />;

  const hasChanges = firstName.trim() !== data.first_name || lastName.trim() !== data.last_name;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold font-display text-ink">الملف الشخصي</h1>
        <p className="mt-1 text-sm text-ink-400">إدارة معلوماتك الشخصية وبيانات حسابك.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* العمود الأيسر: بطاقة الهوية */}
        <div className="lg:col-span-1">
          <div className="card p-6 text-center sticky top-24">
            <span className="mx-auto inline-flex items-center justify-center w-24 h-24 text-3xl font-bold text-white rounded-full bg-gradient-to-br from-ink to-ink-600 shadow-xl mb-4">
              {(firstName[0] ?? data.email[0] ?? "؟").toUpperCase()}
              {(lastName[0] ?? "").toUpperCase()}
            </span>
            <h2 className="text-xl font-bold text-ink">
              {[data.first_name, data.last_name].filter(Boolean).join(" ") || data.email}
            </h2>
            <p className="mt-1 text-sm text-ink-400">{data.email}</p>
            
            <div className="mt-4 flex flex-col items-center gap-2">
              <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-dark">
                {ROLE_LABEL[data.role] ?? data.role}
              </span>
              {data.tenant_name && (
                <span className="rounded-full bg-ink-50 px-3 py-1 text-xs font-medium text-ink-700">
                  🏢 {data.tenant_name}
                </span>
              )}
              {data.two_factor_enabled && (
                <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success flex items-center gap-1">
                  🔒 2FA مفعّل
                </span>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-line">
              <p className="text-xs text-ink-400 leading-relaxed">
                لتغيير البريد الإلكتروني أو الدور الأساسي، يرجى التواصل مع مسؤول المؤسسة.
              </p>
            </div>
          </div>
        </div>

        {/* العمود الأيمن: النموذج والسياق */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="card p-6">
            <h2 className="mb-4 text-lg font-bold font-display text-ink">البيانات الشخصية</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="الاسم الأول"
                value={firstName}
                onChange={(event) =>
                  setDraft((current) => ({
                    first_name: event.target.value,
                    last_name: current?.last_name ?? data.last_name,
                  }))
                }
              />
              <Input
                label="اسم العائلة"
                value={lastName}
                onChange={(event) =>
                  setDraft((current) => ({
                    first_name: current?.first_name ?? data.first_name,
                    last_name: event.target.value,
                  }))
                }
              />
            </div>
            <div className="mt-6 flex justify-end">
              <Button onClick={() => mutation.mutate()} disabled={!hasChanges || mutation.isPending}>
                {mutation.isPending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
              </Button>
            </div>
          </div>

          {data.role === "STUDENT" && <StudentContext userId={data.id} />}
          {data.role === "TEACHER" && <TeacherContext userId={data.id} />}
        </div>
      </div>
    </div>
  );
}

function StudentContext({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["student-detail", userId],
    queryFn: () => getStudentDetail(userId),
  });

  if (isLoading) return <Spinner />;
  if (!data) return null;

  const e = data.current_enrollment;
  const s = data.attempts_summary;

  return (
    <div className="flex flex-col gap-4">
      {e && (
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-bold font-display text-ink">البيانات الأكاديمية</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div><dt className="text-xs text-ink-400">المرحلة</dt><dd className="mt-1 text-sm font-medium text-ink">{e.stage_name}</dd></div>
            <div><dt className="text-xs text-ink-400">الصف</dt><dd className="mt-1 text-sm font-medium text-ink">{e.grade_name}</dd></div>
            <div><dt className="text-xs text-ink-400">المجموعة</dt><dd className="mt-1 text-sm font-medium text-ink">{e.group_name}</dd></div>
            <div><dt className="text-xs text-ink-400">السنة الدراسية</dt><dd className="mt-1 text-sm font-medium text-ink">{e.academic_year_name}</dd></div>
          </dl>
        </div>
      )}

      <div className="card p-6">
        <h2 className="mb-4 text-lg font-bold font-display text-ink">أدائي</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="إجمالي المحاولات" value={s.total_attempts} />
          <Stat label="مصححة" value={s.graded_attempts} />
          <Stat label="ناجحة" value={s.passed_attempts} accent="success" />
          <Stat label="المتوسط" value={s.graded_attempts > 0 ? `${s.average_percentage}%` : "—"} accent="warning" />
        </div>
      </div>

      {data.recent_attempts.length > 0 && (
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-bold font-display text-ink">آخر النتائج</h2>
          <ul className="divide-y divide-line">
            {data.recent_attempts.map((a) => (
              <li key={a.attempt_id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-ink">{a.assessment_title}</p>
                  <p className="mt-0.5 text-xs text-ink-400">{a.score ?? "—"} / {a.max_score} · {a.percentage}%</p>
                </div>
                <div className="flex items-center gap-2">
                  {a.is_passed === true && <span className="text-xs font-medium text-success">✓ ناجح</span>}
                  {a.is_passed === false && <span className="text-xs font-medium text-danger">✗ راسب</span>}
                  <Link href={`/results/${a.attempt_id}`}><Button variant="ghost" className="text-xs">تفاصيل</Button></Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TeacherContext({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["teacher-detail", userId],
    queryFn: () => getTeacherDetail(userId),
  });

  if (isLoading) return <Spinner />;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-6">
        <h2 className="mb-4 text-lg font-bold font-display text-ink">ملخص النشاط</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="طلابي" value={data.students_summary.total_students} />
          <Stat label="امتحاناتي" value={data.assessments_summary.total_assessments} />
          <Stat label="منشورة" value={data.assessments_summary.published} accent="success" />
          <Stat label="بحاجة تصحيح" value={data.assessments_summary.pending_grading} accent={data.assessments_summary.pending_grading > 0 ? "warning" : "default"} />
        </div>
      </div>

      {data.assignments.length > 0 && (
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-bold font-display text-ink">تكليفاتي</h2>
          <ul className="divide-y divide-line">
            {data.assignments.map((a) => (
              <li key={a.id} className="py-3">
                <p className="text-sm font-medium text-ink">{a.course_name}</p>
                <p className="mt-0.5 text-xs text-ink-400">{a.subject_name} · {a.grade_name} · {a.scope_label}</p>
                {a.group_names.length > 0 && <p className="mt-1 text-xs text-ink-400">المجموعات: {a.group_names.join("، ")}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.recent_assessments.length > 0 && (
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-bold font-display text-ink">آخر امتحاناتي</h2>
          <ul className="divide-y divide-line">
            {data.recent_assessments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-ink">{a.title}</p>
                  <p className="mt-0.5 text-xs text-ink-400">{a.status === "PUBLISHED" ? "منشور" : a.status === "DRAFT" ? "مسودة" : a.status}</p>
                </div>
                <Link href={`/assessments/${a.id}/results`}><Button variant="ghost" className="text-xs">النتائج</Button></Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent = "default" }: { label: string; value: string | number; accent?: "default" | "success" | "warning" | "danger" }) {
  const colors = { default: "text-ink", success: "text-success", warning: "text-accent-dark", danger: "text-danger" };
  return (
    <div className="text-center rounded-xl bg-ink-50/50 p-3">
      <p className="text-xs text-ink-400">{label}</p>
      <p className={`mt-1 font-display text-xl font-bold ${colors[accent]}`}>{value}</p>
    </div>
  );
}