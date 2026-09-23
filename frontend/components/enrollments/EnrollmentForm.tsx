"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { QuickCreateModal } from "@/components/common/QuickCreateModal";
import { SmartSelect } from "@/components/common/SmartSelect";
import { UserForm } from "@/components/users/UserForm";
import { Button } from "@/components/ui/Button";
import { listGroups } from "@/lib/api/groups";
import { createUser, listUsers } from "@/lib/api/users";
import { enrollmentSchema, type EnrollmentFormValues, type UserFormValues } from "@/lib/validation/schemas";

export function EnrollmentForm({ onSubmit }: { onSubmit: (values: EnrollmentFormValues) => Promise<void> }) {
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: students, isLoading: studentsLoading } = useQuery({
    queryKey: ["users", "STUDENT"],
    queryFn: () => listUsers("STUDENT"),
  });
  const { data: groups, isLoading: groupsLoading } = useQuery({ queryKey: ["groups"], queryFn: () => listGroups() });

  const {
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EnrollmentFormValues>({ resolver: zodResolver(enrollmentSchema) });

  async function handleCreateStudent(values: UserFormValues) {
    const created = await createUser({ ...values, role: "STUDENT" });
    await queryClient.invalidateQueries({ queryKey: ["users", "STUDENT"] });
    setValue("student", created.id, { shouldValidate: true });
    setStudentModalOpen(false);
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Controller
          name="student"
          control={control}
          render={({ field }) => (
            <SmartSelect
              label="الطالب"
              value={field.value ?? ""}
              onChange={field.onChange}
              isLoading={studentsLoading}
              options={(students?.results ?? []).map((s) => ({ value: s.id, label: s.email }))}
              onCreateNew={() => setStudentModalOpen(true)}
              createLabel="+ إضافة طالب"
              error={errors.student?.message}
            />
          )}
        />
        <Controller
          name="group"
          control={control}
          render={({ field }) => (
            <SmartSelect
              label="المجموعة"
              value={field.value ?? ""}
              onChange={field.onChange}
              isLoading={groupsLoading}
              options={(groups?.results ?? []).map((g) => ({ value: g.id, label: g.name }))}
              error={errors.group?.message}
            />
          )}
        />
        <Button type="submit" disabled={isSubmitting} className="mt-2">
          {isSubmitting ? "جارٍ الحفظ..." : "حفظ"}
        </Button>
      </form>

      <QuickCreateModal open={studentModalOpen} onClose={() => setStudentModalOpen(false)} title="إضافة طالب">
        <UserForm onSubmit={handleCreateStudent} fixedRole="STUDENT" />
      </QuickCreateModal>
    </>
  );
}
