"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CourseForm } from "@/components/courses/CourseForm";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, Spinner } from "@/components/ui/States";
import { createCourse, listCourses } from "@/lib/api/courses";
import type { CourseFormValues } from "@/lib/validation/schemas";

export default function CoursesPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({ queryKey: ["courses"], queryFn: listCourses });

  async function handleCreate(values: CourseFormValues) {
    await createCourse(values);
    await queryClient.invalidateQueries({ queryKey: ["courses"] });
    setModalOpen(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">الكورسات</h1>
        <Button onClick={() => setModalOpen(true)}>+ إضافة كورس</Button>
      </div>

      {isLoading && <Spinner />}
      {isError && <ErrorState message="تعذّر تحميل الكورسات." />}
      {!isLoading && !isError && data?.results.length === 0 && (
        <EmptyState
          title="لا توجد كورسات بعد"
          description="أضف كورسًا واختر له مادة وصفًا، أو أنشئهما أثناء الإضافة."
        />
      )}

      {!isLoading && !isError && data && data.results.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-ink-50 text-start text-ink-700">
              <tr>
                <th className="px-4 py-3 text-start font-medium">اسم الكورس</th>
                <th className="px-4 py-3 text-start font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((course) => (
                <tr key={course.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{course.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        course.is_active ? "bg-success/10 text-success" : "bg-ink-50 text-ink-400"
                      }`}
                    >
                      {course.is_active ? "نشط" : "غير نشط"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <QuickCreateModal open={modalOpen} onClose={() => setModalOpen(false)} title="إضافة كورس">
        <CourseForm onSubmit={handleCreate} />
      </QuickCreateModal>
    </div>
  );
}
