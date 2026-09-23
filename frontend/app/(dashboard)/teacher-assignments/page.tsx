"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { TeacherAssignmentForm } from "@/components/teacher-assignments/TeacherAssignmentForm";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import { createTeacherAssignment, listTeacherAssignments } from "@/lib/api/teacherAssignments";
import type { TeacherAssignmentFormValues } from "@/lib/validation/schemas";

export default function TeacherAssignmentsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["teacher-assignments"],
    queryFn: listTeacherAssignments,
  });

  async function handleCreate(values: TeacherAssignmentFormValues) {
    await createTeacherAssignment(values);
    await queryClient.invalidateQueries({ queryKey: ["teacher-assignments"] });
    setModalOpen(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">تكليفات المعلمين</h1>
        <Button onClick={() => setModalOpen(true)}>+ إضافة تكليف</Button>
      </div>

      {isLoading && <Spinner />}
      {isError && <ErrorState message="تعذّر تحميل التكليفات." />}
      {!isLoading && !isError && data?.results.length === 0 && (
        <EmptyState
          title="لا توجد تكليفات بعد"
          description="اربط معلمًا بكورس ليحدَّد نطاق ما يراه من طلاب ونتائج."
        />
      )}

      {!isLoading && !isError && data && data.results.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-ink-50 text-start text-ink-700">
              <tr>
                <th className="px-4 py-3 text-start font-medium">المعلم</th>
                <th className="px-4 py-3 text-start font-medium">الكورس</th>
                <th className="px-4 py-3 text-start font-medium">النطاق</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{row.teacher}</td>
                  <td className="px-4 py-3 text-ink-400">{row.course}</td>
                  <td className="px-4 py-3 text-ink-400">
                    {row.groups.length === 0 ? "الصف كامل" : `${row.groups.length} مجموعة`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <QuickCreateModal open={modalOpen} onClose={() => setModalOpen(false)} title="إضافة تكليف معلم">
        <TeacherAssignmentForm onSubmit={handleCreate} />
      </QuickCreateModal>
    </div>
  );
}
