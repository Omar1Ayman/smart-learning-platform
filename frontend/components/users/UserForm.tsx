"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { userSchema, type UserFormValues } from "@/lib/validation/schemas";

const ROLE_LABEL: Record<string, string> = { ADMIN: "مسؤول", TEACHER: "معلّم", STUDENT: "طالب" };

interface UserFormProps {
  onSubmit: (values: UserFormValues) => Promise<void>;
  /** When set, the role field is hidden and locked — used when this form
   * is opened as a nested quick-create (e.g. "+ إضافة معلم" from inside
   * the Teacher Assignment form should always create a TEACHER). */
  fixedRole?: "ADMIN" | "TEACHER" | "STUDENT";
}

export function UserForm({ onSubmit, fixedRole }: UserFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: fixedRole ? { role: fixedRole } : undefined,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <Input label="الاسم الأول" error={errors.first_name?.message} {...register("first_name")} />
      <Input
        label="البريد الإلكتروني"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <Input
        label="كلمة المرور المبدئية"
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register("password")}
      />
      {!fixedRole && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink-700">الدور</label>
          <select
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
            {...register("role")}
            defaultValue=""
          >
            <option value="" disabled>
              اختر دورًا
            </option>
            {Object.entries(ROLE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {errors.role && <p className="text-xs text-danger">{errors.role.message}</p>}
        </div>
      )}
      {fixedRole && <input type="hidden" value={fixedRole} {...register("role")} />}
      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "جارٍ الحفظ..." : `حفظ${fixedRole ? ` (${ROLE_LABEL[fixedRole]})` : ""}`}
      </Button>
    </form>
  );
}
