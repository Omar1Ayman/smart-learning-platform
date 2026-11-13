"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { SmartSelect } from "@/components/common/SmartSelect";
import { FormErrorSummary } from "@/components/ui/FormErrorSummary";
import { FormFooter } from "@/components/ui/FormFooter";
import { UserForm } from "@/components/users/UserForm";
import { listGrades } from "@/lib/api/grades";
import { listGroups, type Group } from "@/lib/api/groups";
import { listTerms } from "@/lib/api/terms";
import { createUser, listUsers } from "@/lib/api/users";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import { toastSuccess } from "@/lib/utils/toast";
import {
  enrollmentSchema,
  type EnrollmentFormValues,
  type UserFormValues,
} from "@/lib/validation/schemas";

interface EnrollmentFormProps {
  onSubmit: (values: EnrollmentFormValues) => Promise<void>;
  onCancel?: () => void;
  initialGroup?: string;
  initialValues?: Partial<EnrollmentFormValues>;
}

export function EnrollmentForm({
  onSubmit,
  onCancel,
  initialGroup,
  initialValues,
}: EnrollmentFormProps) {
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const isEdit = !!initialValues;

  const { data: students, isLoading: studentsLoading } = useQuery({
    queryKey: ["users", "STUDENT"],
    queryFn: () => listUsers("STUDENT"),
  });
  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ["groups"],
    queryFn: () => listGroups(),
  });
  const { data: grades } = useQuery({
    queryKey: ["grades"],
    queryFn: () => listGrades(),
  });
  const { data: terms } = useQuery({
    queryKey: ["terms"],
    queryFn: () => listTerms(),
  });

  const {
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting, dirtyFields, isSubmitted },
  } = useForm<EnrollmentFormValues>({
    resolver: zodResolver(enrollmentSchema),
    mode: "onTouched",
    defaultValues: {
      ...(initialGroup ? { group: initialGroup } : {}),
      ...initialValues,
    },
  });

  useUnsavedChangesWarning(Object.keys(dirtyFields).length > 0);
  const selectedGroupId = useWatch({ control, name: "group" });
  const selectedGroup = (groups?.results ?? []).find((g) => g.id === selectedGroupId);
  const selectedGroupYearId = selectedGroup?.academic_year;

  const filteredTerms = (terms?.results ?? []).filter(
    (t) => !selectedGroupYearId || t.academic_year === selectedGroupYearId
  );

  const gradeMap = new Map((grades?.results ?? []).map((g) => [g.id, g.name]));
  const groupsByGrade = new Map<string, Group[]>();
  for (const g of groups?.results ?? []) {
    const key = gradeMap.get(g.grade) ?? "غير محدد";
    if (!groupsByGrade.has(key)) groupsByGrade.set(key, []);
    groupsByGrade.get(key)!.push(g);
  }

  const errorMessages = Object.entries(errors)
    .map(([field, err]) => {
      const label =
        {
          student: "الطالب",
          group: "المجموعة",
          term: "الترم",
        }[field] ?? field;
      return err?.message ? `${label}: ${err.message}` : null;
    })
    .filter(Boolean) as string[];

  async function handleCreateStudent(values: UserFormValues) {
    const created = await createUser({ ...values, role: "STUDENT" });
    await queryClient.invalidateQueries({ queryKey: ["users", "STUDENT"] });
    setValue("student", created.id, { shouldValidate: true });
    toastSuccess("تمت إضافة الطالب وإرسال دعوة تفعيل إلى بريده الإلكتروني");
    setStudentModalOpen(false);
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <FormErrorSummary messages={isSubmitted ? errorMessages : []} />

        {isEdit && (
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs text-ink">
            الطالب غير قابل للتعديل. لتغييره، احذف التسجيل وأضِف تسجيلًا جديدًا.
            هنا يمكنك تعديل المجموعة أو الترم.
          </div>
        )}

        <Controller
          name="student"
          control={control}
          render={({ field }) => (
            <SmartSelect
              label="الطالب *"
              value={field.value ?? ""}
              onChange={field.onChange}
              isLoading={studentsLoading}
              options={(students?.results ?? []).map((s) => ({
                value: s.id,
                label:
                  [s.first_name, s.last_name].filter(Boolean).join(" ").trim() ||
                  s.email,
              }))}
              onCreateNew={isEdit ? undefined : () => setStudentModalOpen(true)}
              createLabel="+ إضافة طالب"
              error={errors.student?.message}
              emptyMessage="لم يُضف طلاب بعد"
              disabled={isEdit}
            />
          )}
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink">
            المجموعة <span className="text-danger">*</span>
          </label>
          <Controller
            name="group"
            control={control}
            render={({ field }) => (
              <select
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value)}
                disabled={groupsLoading}
                className={`rounded-lg border bg-paper-elevated px-3 py-2 text-sm text-ink outline-none transition-all focus:border-ink focus:ring-2 focus:ring-ink/10 disabled:cursor-not-allowed disabled:bg-paper-muted ${
                  errors.group ? "border-danger focus:border-danger focus:ring-danger/10" : "border-line"
                }`}
              >
                <option value="">
                  {groupsLoading ? "جارٍ التحميل..." : "اختر المجموعة..."}
                </option>
                {Array.from(groupsByGrade.entries()).map(
                  ([gradeName, groupList]) => (
                    <optgroup key={gradeName} label={gradeName}>
                      {groupList.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </optgroup>
                  )
                )}
              </select>
            )}
          />
          {errors.group && (
            <p className="text-xs text-danger">{errors.group.message}</p>
          )}
        </div>

        <Controller
          name="term"
          control={control}
          render={({ field }) => (
            <SmartSelect
              label="الترم (اختياري)"
              value={field.value ?? ""}
              onChange={field.onChange}
              options={filteredTerms.map((t) => ({
                value: t.id,
                label: t.name,
              }))}
              emptyMessage={
                selectedGroup
                  ? "لا توجد ترمات في سنة هذه المجموعة"
                  : "اختر المجموعة أولاً لتظهر الترمات"
              }
            />
          )}
        />
        <p className="text-xs text-ink-400">
          اتركه فارغًا لتسجيل الطالب لكل السنة. حدده إذا كان التسجيل لترم معين
          فقط (مفيد عند تغيير المجموعة في منتصف السنة).
        </p>

        <FormFooter
          isSubmitting={isSubmitting}
          submitLabel={isEdit ? "حفظ التعديلات" : "حفظ"}
          onCancel={onCancel}
        />
      </form>

      {!isEdit && (
        <QuickCreateModal
          open={studentModalOpen}
          onClose={() => setStudentModalOpen(false)}
          title="إضافة طالب"
        >
          <UserForm
            onSubmit={handleCreateStudent}
            onCancel={() => setStudentModalOpen(false)}
            fixedRole="STUDENT"
          />
        </QuickCreateModal>
      )}
    </>
  );
}