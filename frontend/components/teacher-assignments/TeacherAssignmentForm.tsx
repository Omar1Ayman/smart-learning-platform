"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { SmartSelect } from "@/components/common/SmartSelect";
import { CourseForm } from "@/components/courses/CourseForm";
import { FormErrorSummary } from "@/components/ui/FormErrorSummary";
import { FormFooter } from "@/components/ui/FormFooter";
import { UserForm } from "@/components/users/UserForm";
import { AlertTriangle, Plus } from "@/components/ui/icons";
import { createCourse, listCourses } from "@/lib/api/courses";
import { listGroups } from "@/lib/api/groups";
import { createUser, listUsers } from "@/lib/api/users";
import { apiClient } from "@/lib/api/client";
import { updateTeacherAssignment } from "@/lib/api/teacherAssignments"; // 👈 استيراد دالة التحديث
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import { toastSuccess, toastError } from "@/lib/utils/toast";
import {
  teacherAssignmentSchema,
  type CourseFormValues,
  type TeacherAssignmentFormValues,
  type UserFormValues,
} from "@/lib/validation/schemas";

interface TeacherAssignmentFormProps {
  onSubmit: (values: TeacherAssignmentFormValues) => Promise<void>;
  onCancel?: () => void;
  initialCourseId?: string;
  initialGroups?: string[];
  initialValues?: Partial<TeacherAssignmentFormValues>;
  gradeFilter?: string;
  academicYearFilter?: string;
}

interface ExistingAssignment {
  id: string;
  teacher_email: string;
  course_name: string;
  groups: string[];
  group_names: string[];
}

export function TeacherAssignmentForm({
  onSubmit,
  onCancel,
  initialCourseId,
  initialGroups = [], 
  initialValues,
  gradeFilter,
  academicYearFilter,
}: TeacherAssignmentFormProps) {
  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const queryClient = useQueryClient();
  const isEdit = !!initialValues;

  const { data: teachers, isLoading: teachersLoading } = useQuery({
    queryKey: ["users", "TEACHER"],
    queryFn: () => listUsers("TEACHER"),
  });

  const { data: courses, isLoading: coursesLoading } = useQuery({
    queryKey: ["courses", gradeFilter, academicYearFilter], 
    queryFn: () => listCourses({ 
      grade: gradeFilter, 
      academic_year: academicYearFilter 
    }),
  });

  const {
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting, dirtyFields, isSubmitted },
  } = useForm<TeacherAssignmentFormValues>({
    resolver: zodResolver(teacherAssignmentSchema),
    mode: "onTouched",
    defaultValues: {
      course: initialCourseId ?? "",
      groups: initialGroups, // 👈 ربط المجموعة التي أتينا منها
      ...initialValues,
    },
  });

  useUnsavedChangesWarning(Object.keys(dirtyFields).length > 0);

  const selectedTeacherId = useWatch({ control, name: "teacher" });
  const selectedCourseId = useWatch({ control, name: "course" });
  const selectedCourse = courses?.results.find((c) => c.id === selectedCourseId);

  const { data: candidateGroups } = useQuery({
    queryKey: ["groups", selectedCourse?.grade],
    queryFn: () => listGroups({ grade: selectedCourse!.grade }),
    enabled: !!selectedCourse,
  });

  // فحص هل هذا التكليف موجود بالفعل؟
  const { data: existingAssignment, isFetching: checkingExisting } = useQuery<ExistingAssignment | null>({
    queryKey: ["teacher-assignment-exists", selectedTeacherId, selectedCourseId],
    queryFn: async () => {
      const { data } = await apiClient.get("/teacher-assignments/", {
        params: { teacher: selectedTeacherId, course: selectedCourseId },
      });
      return data.results?.[0] ?? null;
    },
    enabled: !isEdit && !!selectedTeacherId && !!selectedCourseId,
  });

  const isDuplicate = !isEdit && !!existingAssignment;

  // 👈 دالة الذكاء: دمج المجموعة الجديدة مع التكليف القديم
  async function handleMergeWithExisting() {
    if (!existingAssignment || initialGroups.length === 0) return;
    
    setIsMerging(true);
    try {
      // دمج المجموعات القديمة مع المجموعة الجديدة (بدون تكرار)
      const mergedGroups = Array.from(
        new Set([...existingAssignment.groups, ...initialGroups])
      );

      await updateTeacherAssignment(existingAssignment.id, {
        groups: mergedGroups,
      });

      toastSuccess("تمت إضافة المجموعة الجديدة إلى تكليف المعلم بنجاح");
      await queryClient.invalidateQueries({ queryKey: ["teacher-assignments"] });
      await queryClient.invalidateQueries({ queryKey: ["group-detail"] });
      onCancel?.(); // إغلاق المودال
    } catch (err) {
      toastError(err, "تعذّر تحديث تكليف المعلم.");
    } finally {
      setIsMerging(false);
    }
  }

  const errorMessages = Object.entries(errors)
    .map(([field, err]) => {
      const label =
        { teacher: "المعلم", course: "المادة الدراسية", groups: "المجموعات" }[field] ?? field;
      return err?.message ? `${label}: ${err.message}` : null;
    })
    .filter(Boolean) as string[];

  async function handleCreateTeacher(values: UserFormValues) {
    const created = await createUser({ ...values, role: "TEACHER" });
    await queryClient.invalidateQueries({ queryKey: ["users", "TEACHER"] });
    setValue("teacher", created.id, { shouldValidate: true });
    toastSuccess("تمت إضافة المعلم وإرسال دعوة تفعيل إلى بريده الإلكتروني");
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
        <FormErrorSummary messages={isSubmitted ? errorMessages : []} />

        {isEdit && (
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs text-ink-700">
            المعلم والمادة غير قابلين للتعديل. هنا يمكنك تعديل المجموعات فقط.
          </div>
        )}

        <Controller
          name="teacher"
          control={control}
          render={({ field }) => (
            <SmartSelect
              label="المعلم *"
              value={field.value ?? ""}
              onChange={field.onChange}
              isLoading={teachersLoading}
              options={(teachers?.results ?? []).map((t) => ({
                value: t.id,
                label: [t.first_name, t.last_name].filter(Boolean).join(" ").trim() || t.email,
              }))}
              onCreateNew={isEdit ? undefined : () => setTeacherModalOpen(true)}
              createLabel="+ إضافة معلم"
              error={errors.teacher?.message}
              disabled={isEdit}
            />
          )}
        />

        <Controller
          name="course"
          control={control}
          render={({ field }) => (
            <SmartSelect
              label="المادة الدراسية *"
              value={field.value ?? ""}
              onChange={(v) => {
                field.onChange(v);
                setValue("groups", []); // تصفير المجموعات عند تغيير المادة
              }}
              isLoading={coursesLoading}
              options={(courses?.results ?? []).map((c) => ({
                value: c.id,
                label: c.name,
              }))}
              onCreateNew={isEdit || gradeFilter ? undefined : () => setCourseModalOpen(true)}
              createLabel="+ إضافة كورس"
              error={errors.course?.message}
              disabled={isEdit}
            />
          )}
        />

        {checkingExisting && selectedTeacherId && selectedCourseId && (
          <div className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-400">
            جارٍ التحقق من التكليفات الموجودة...
          </div>
        )}

        {/* 👈 الرسالة الذكية: بدل الخطأ، نعرض زر للإضافة */}
        {isDuplicate && existingAssignment && (
          <div className="rounded-lg border-2 border-accent/50 bg-accent/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-accent-dark" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ink">
                  هذا المعلم مُسند بالفعل لهذه المادة
                </p>
                <p className="mt-1 text-xs text-ink-700">
                  المجموعات الحالية: <strong>{existingAssignment.group_names.join(", ") || "كل مجموعات الصف"}</strong>
                </p>
                <p className="mt-2 text-xs text-ink-700">
                  يمكنك إضافة المجموعة الحالية (التي أنت بداخلها الآن) إلى نفس التكليف بضغطة واحدة.
                </p>
                <button
                  type="button"
                  onClick={handleMergeWithExisting}
                  disabled={isMerging}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-ink shadow-sm transition-colors hover:bg-accent-dark disabled:opacity-50"
                >
                  <Plus size={14} />
                  {isMerging ? "جارٍ الإضافة..." : "إضافة هذه المجموعة للتكليف الموجود"}
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedCourse && !isDuplicate && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-700">
              المجموعات{" "}
              <span className="font-normal text-ink-400">(اتركها فارغة = كل الصف)</span>
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
                      <label key={group.id} className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const current = field.value ?? [];
                            field.onChange(
                              e.target.checked
                                ? [...current, group.id]
                                : current.filter((id) => id !== group.id)
                            );
                          }}
                          className="h-4 w-4 accent-ink"
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

        <FormFooter
          isSubmitting={isSubmitting}
          submitLabel={isEdit ? "حفظ التعديلات" : "حفظ"}
          onCancel={onCancel}
          submitDisabled={isDuplicate} // تعطيل الحفظ العادي لو في تكرار
        />
      </form>

      {/* المودالات الفرعية */}
      {!isEdit && (
        <>
          <QuickCreateModal open={teacherModalOpen} onClose={() => setTeacherModalOpen(false)} title="إضافة معلم">
            <UserForm onSubmit={handleCreateTeacher} onCancel={() => setTeacherModalOpen(false)} fixedRole="TEACHER" />
          </QuickCreateModal>
          <QuickCreateModal open={courseModalOpen} onClose={() => setCourseModalOpen(false)} title="إضافة كورس">
            <CourseForm onSubmit={handleCreateCourse} onCancel={() => setCourseModalOpen(false)} initialGrade={gradeFilter} initialAcademicYear={academicYearFilter} />
          </QuickCreateModal>
        </>
      )}
    </>
  );
}