"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { CourseForm } from "@/components/courses/CourseForm";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { SmartSelect } from "@/components/common/SmartSelect";
import { UserForm } from "@/components/users/UserForm";
import { Button } from "@/components/ui/Button";
import { createCourse, listCourses } from "@/lib/api/courses";
import { listGroups } from "@/lib/api/groups";
import { createUser, listUsers } from "@/lib/api/users";
import {
  teacherAssignmentSchema,
  type CourseFormValues,
  type TeacherAssignmentFormValues,
  type UserFormValues,
} from "@/lib/validation/schemas";

export function TeacherAssignmentForm({
  onSubmit,
}: {
  onSubmit: (values: TeacherAssignmentFormValues) => Promise<void>;
}) {
  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: teachers, isLoading: teachersLoading } = useQuery({
    queryKey: ["users", "TEACHER"],
    queryFn: () => listUsers("TEACHER"),
  });
  const { data: courses, isLoading: coursesLoading } = useQuery({ queryKey: ["courses"], queryFn: listCourses });

  const {
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TeacherAssignmentFormValues>({
    resolver: zodResolver(teacherAssignmentSchema),
    defaultValues: { groups: [] },
  });

  const selectedCourseId = useWatch({ control, name: "course" });
  const selectedCourse = courses?.results.find((c) => c.id === selectedCourseId);

  const { data: candidateGroups } = useQuery({
    queryKey: ["groups", selectedCourse?.grade],
    queryFn: () => listGroups({ grade: selectedCourse!.grade }),
    enabled: !!selectedCourse,
  });

  async function handleCreateTeacher(values: UserFormValues) {
    const created = await createUser({ ...values, role: "TEACHER" });
    await queryClient.invalidateQueries({ queryKey: ["users", "TEACHER"] });
    setValue("teacher", created.id, { shouldValidate: true });
    setTeacherModalOpen(false);
  }

  async function handleCreateCourse(values: CourseFormValues) {
    const created = await createCourse(values);
    await queryClient.invalidateQueries({ queryKey: ["courses"] });
    setValue("course", created.id, { shouldValidate: true });
    setCourseModalOpen(false);
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Controller
          name="teacher"
          control={control}
          render={({ field }) => (
            <SmartSelect
              label="المعلم"
              value={field.value ?? ""}
              onChange={field.onChange}
              isLoading={teachersLoading}
              options={(teachers?.results ?? []).map((t) => ({ value: t.id, label: t.email }))}
              onCreateNew={() => setTeacherModalOpen(true)}
              createLabel="+ إضافة معلم"
              error={errors.teacher?.message}
            />
          )}
        />
        <Controller
          name="course"
          control={control}
          render={({ field }) => (
            <SmartSelect
              label="الكورس"
              value={field.value ?? ""}
              onChange={(value) => {
                field.onChange(value);
                setValue("groups", []); // grade changed underneath -> old group picks are no longer valid
              }}
              isLoading={coursesLoading}
              options={(courses?.results ?? []).map((c) => ({ value: c.id, label: c.name }))}
              onCreateNew={() => setCourseModalOpen(true)}
              createLabel="+ إضافة كورس"
              error={errors.course?.message}
            />
          )}
        />

        {selectedCourse && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-700">
              المجموعات <span className="font-normal text-ink-400">(اتركها فارغة = كل الصف)</span>
            </label>
            <Controller
              name="groups"
              control={control}
              render={({ field }) => (
                <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
                  {(candidateGroups?.results ?? []).length === 0 && (
                    <p className="text-sm text-ink-400">لا توجد مجموعات لهذا الصف بعد.</p>
                  )}
                  {(candidateGroups?.results ?? []).map((group) => {
                    const checked = (field.value ?? []).includes(group.id);
                    return (
                      <label key={group.id} className="flex items-center gap-2 text-sm text-ink-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const current = field.value ?? [];
                            field.onChange(
                              e.target.checked ? [...current, group.id] : current.filter((id) => id !== group.id)
                            );
                          }}
                        />
                        {group.name}
                      </label>
                    );
                  })}
                </div>
              )}
            />
          </div>
        )}

        <Button type="submit" disabled={isSubmitting} className="mt-2">
          {isSubmitting ? "جارٍ الحفظ..." : "حفظ"}
        </Button>
      </form>

      <QuickCreateModal open={teacherModalOpen} onClose={() => setTeacherModalOpen(false)} title="إضافة معلم">
        <UserForm onSubmit={handleCreateTeacher} fixedRole="TEACHER" />
      </QuickCreateModal>

      <QuickCreateModal open={courseModalOpen} onClose={() => setCourseModalOpen(false)} title="إضافة كورس">
        <CourseForm onSubmit={handleCreateCourse} />
      </QuickCreateModal>
    </>
  );
}
