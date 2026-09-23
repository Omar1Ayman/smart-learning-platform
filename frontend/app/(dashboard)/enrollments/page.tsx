"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { EnrollmentForm } from "@/components/enrollments/EnrollmentForm";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import { createEnrollment, listEnrollments, type EnrollmentStatus } from "@/lib/api/enrollments";
import { useAuthStore } from "@/lib/auth/store";
import type { EnrollmentFormValues } from "@/lib/validation/schemas";

const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  ACTIVE: "نشط",
  INACTIVE: "غير نشط",
  SUSPENDED: "موقوف",
  TRANSFERRED: "منقول",
  GRADUATED: "متخرج",
  ARCHIVED: "مؤرشف",
};

const STATUS_STYLE: Record<EnrollmentStatus, string> = {
  ACTIVE: "bg-success/10 text-success",
  GRADUATED: "bg-accent/20 text-ink-700",
  INACTIVE: "bg-ink-50 text-ink-400",
  SUSPENDED: "bg-danger/10 text-danger",
  TRANSFERRED: "bg-ink-50 text-ink-400",
  ARCHIVED: "bg-ink-50 text-ink-400",
};

export default function EnrollmentsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role === "OWNER" || role === "ADMIN";

  const { data, isLoading, isError } = useQuery({ queryKey: ["enrollments"], queryFn: listEnrollments });

  async function handleCreate(values: EnrollmentFormValues) {
    await createEnrollment(values);
    await queryClient.invalidateQueries({ queryKey: ["enrollments"] });
    setModalOpen(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">التسجيلات</h1>
        {canManage && <Button onClick={() => setModalOpen(true)}>+ تسجيل طالب</Button>}
      </div>

      {isLoading && <Spinner />}
      {isError && <ErrorState message="تعذّر تحميل التسجيلات." />}
      {!isLoading && !isError && data?.results.length === 0 && (
        <EmptyState
          title="لا توجد تسجيلات بعد"
          description={canManage ? "سجّل طالبًا في مجموعة لبدء متابعة تقدمه." : "لا يوجد لديك تسجيل حاليًا."}
        />
      )}

      {!isLoading && !isError && data && data.results.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-ink-50 text-start text-ink-700">
              <tr>
                <th className="px-4 py-3 text-start font-medium">الطالب</th>
                <th className="px-4 py-3 text-start font-medium">المجموعة</th>
                <th className="px-4 py-3 text-start font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((enrollment) => (
                <tr key={enrollment.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{enrollment.student}</td>
                  <td className="px-4 py-3 text-ink-400">{enrollment.group}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[enrollment.status]}`}
                    >
                      {STATUS_LABEL[enrollment.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <QuickCreateModal open={modalOpen} onClose={() => setModalOpen(false)} title="تسجيل طالب">
          <EnrollmentForm onSubmit={handleCreate} />
        </QuickCreateModal>
      )}
    </div>
  );
}
