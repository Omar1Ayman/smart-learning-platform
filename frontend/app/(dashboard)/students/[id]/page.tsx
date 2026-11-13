"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { ParentLinksSection } from "@/components/students/ParentLinksSection";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DetailPage } from "@/components/ui/DetailPage";
import { EmptyStateV3 } from "@/components/ui/EmptyStateV3";
import { UserEditForm } from "@/components/users/UserEditForm";
import { getStudentDetail } from "@/lib/api/profiles";
import { deleteUser, updateUser, type UserUpdateInput } from "@/lib/api/users";
import { useCanWrite } from "@/lib/auth/useCanWrite";
import { toastError, toastSuccess } from "@/lib/utils/toast";

export default function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const canWrite = useCanWrite();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);

  const q = useQuery({
    queryKey: ["student-detail", id],
    queryFn: () => getStudentDetail(id),
    retry: (count, err) => {
      const status =
        (err as { status?: number })?.status ??
        (err as { response?: { status?: number } })?.response?.status;
      return status === 404 ? false : count < 2;
    },
  });

  const data = q.data;
  const status =
    (q.error as { status?: number } | null)?.status ??
    (q.error as { response?: { status?: number } } | null)?.response?.status;
  const isNotFound = status === 404;

  const name =
    data &&
    ([data.first_name, data.last_name].filter(Boolean).join(" ") || data.email);

  async function handleUpdate(values: UserUpdateInput) {
    await updateUser(id, values);
    await queryClient.invalidateQueries({ queryKey: ["student-detail", id] });
    await queryClient.invalidateQueries({ queryKey: ["students"] });
    toastSuccess("تم تحديث الطالب");
    setEditOpen(false);
  }

  async function handleDelete() {
    setBusyDelete(true);
    try {
      await deleteUser(id);
      await queryClient.invalidateQueries({ queryKey: ["students"] });
      toastSuccess("تم حذف الطالب");
      router.push("/students");
    } catch (err) {
      toastError(err, "تعذّر الحذف.");
    } finally {
      setBusyDelete(false);
    }
  }

  // ---- hero ----
  const hero = data ? (
    <div className="card overflow-hidden">
      <div className="h-20 bg-gradient-to-l from-ink-50 to-transparent" />
      <div className="-mt-10 flex flex-col gap-4 p-6 sm:flex-row sm:items-end">
        <span
          aria-hidden
          className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-ink font-display text-2xl font-bold text-white ring-4 ring-white"
        >
          {name?.[0]?.toUpperCase() ?? "؟"}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-bold text-ink">{name}</h2>
          <p className="mt-0.5 truncate text-sm text-ink-400">{data.email}</p>
          {data.student_code && (
            <p className="mt-1 font-mono text-xs text-ink-700">
              {data.student_code}
            </p>
          )}
          {data.current_enrollment && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                data.current_enrollment.stage_name,
                data.current_enrollment.grade_name,
                data.current_enrollment.group_name,
                data.current_enrollment.academic_year_name,
              ]
                .filter(Boolean)
                .map((label, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[11px] font-medium text-ink-700 ring-1 ring-ink-100"
                  >
                    {label}
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  // ---- stats ----
  const stats = data
    ? [
        {
          label: "إجمالي المحاولات",
          value: data.attempts_summary.total_attempts,
        },
        {
          label: "مصححة",
          value: data.attempts_summary.graded_attempts,
          accent: "success" as const,
        },
        {
          label: "ناجحة",
          value: data.attempts_summary.passed_attempts,
          accent: "success" as const,
        },
        {
          label: "المتوسط",
          value:
            data.attempts_summary.graded_attempts > 0
              ? `${data.attempts_summary.average_percentage}%`
              : "—",
          accent:
            data.attempts_summary.average_percentage >= 60
              ? ("success" as const)
              : data.attempts_summary.average_percentage > 0
                ? ("warning" as const)
                : ("default" as const),
        },
      ]
    : undefined;

  // ---- sections ----
  const sections = data
    ? [
        {
          key: "recent-attempts",
          title: "آخر المحاولات",
          action:
            data.recent_attempts.length > 0 ? (
              <Link
                href={`/assessments?student=${id}`}
                className="text-xs text-ink-400 hover:text-ink"
              >
                عرض الكل ←
              </Link>
            ) : undefined,
          content:
            data.recent_attempts.length === 0 ? (
              <EmptyStateV3
                variant="no-data"
                icon="📝"
                title="لا توجد محاولات"
                description="لم يُكمل هذا الطالب أي امتحان بعد."
              />
            ) : (
              <ul className="divide-y divide-line">
                {data.recent_attempts.map((a) => (
                  <li
                    key={a.attempt_id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/assessments/${a.assessment_id}/results`}
                        className="block truncate text-sm font-medium text-ink hover:underline"
                      >
                        {a.assessment_title}
                      </Link>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-400">
                        <span dir="ltr">
                          {a.score ?? "—"} / {a.max_score}
                        </span>
                        <span aria-hidden>·</span>
                        <span
                          className={
                            a.is_passed === true
                              ? "text-success"
                              : a.is_passed === false
                                ? "text-danger"
                                : ""
                          }
                        >
                          {a.percentage}%
                        </span>
                      </p>
                    </div>
                    <Link href={`/results/${a.attempt_id}`}>
                      <Button variant="ghost" className="text-xs">
                        تفاصيل
                      </Button>
                    </Link>
                  </li>
                ))}
              </ul>
            ),
        },
      ]
    : undefined;

  return (
    <>
      <DetailPage
        breadcrumb={[
          { label: "الطلاب", href: "/students" },
          { label: name ?? "..." },
        ]}
        title={name ?? "بيانات الطالب"}
        description={data?.email}
        actions={
          <>
            {data && (
              <Link href={`/students/${id}/card`}>
                <Button variant="secondary">🎫 البطاقة</Button>
              </Link>
            )}
            {canWrite && data && (
              <ActionMenu
                items={[
                  { label: "تعديل البيانات", onClick: () => setEditOpen(true) },
                  {
                    label: "حذف الطالب",
                    variant: "danger",
                    onClick: () => setDeleteOpen(true),
                  },
                ]}
              />
            )}
          </>
        }
        hero={hero}
        stats={stats}
        sections={sections}
        isLoading={q.isLoading}
        isError={q.isError}
        errorMessage={
          isNotFound ? "الطالب غير موجود." : "تعذّر تحميل بيانات الطالب."
        }
        onRetry={isNotFound ? undefined : () => q.refetch()}
      >
        {data && <ParentLinksSection studentId={data.id} />}
      </DetailPage>

      {canWrite && data && (
        <QuickCreateModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title={`تعديل — ${data.email}`}
        >
          <UserEditForm
            onSubmit={handleUpdate}
            onCancel={() => setEditOpen(false)}
            initialValues={{
              email: data.email,
              role: "STUDENT",
              first_name: data.first_name,
              last_name: data.last_name,
              is_active: (data as { is_active?: boolean }).is_active ?? true,
              parent_name: (data as { parent_name?: string }).parent_name,
              parent_email: (data as { parent_email?: string }).parent_email,
              parent_phone: (data as { parent_phone?: string }).parent_phone,
            }}
          />
        </QuickCreateModal>
      )}

      <ConfirmDialog
        open={deleteOpen}
        title="تأكيد حذف الطالب"
        description={
          data
            ? `سيُحذف "${data.email}" نهائيًا مع كل محاولاته. لا يمكن التراجع.`
            : ""
        }
        confirmLabel={busyDelete ? "جارٍ الحذف…" : "حذف نهائي"}
        cancelLabel="إلغاء"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
        isPending={busyDelete}
      />
    </>
  );
}