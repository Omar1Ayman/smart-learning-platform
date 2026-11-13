"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { FormErrorSummary } from "@/components/ui/FormErrorSummary";
import { FormFooter } from "@/components/ui/FormFooter";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import { userSchema, type UserFormValues } from "@/lib/validation/schemas";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "مسؤول",
  TEACHER: "معلّم",
  STUDENT: "طالب",
};

interface UserFormProps {
  onSubmit: (values: UserFormValues) => Promise<void>;
  onCancel?: () => void;
  /** When set, the role field is hidden and locked — used when this form
   * is opened as a nested quick-create (e.g. "+ إضافة معلم" from inside
   * the Teacher Assignment form should always create a TEACHER). */
  fixedRole?: "ADMIN" | "TEACHER" | "STUDENT";
}

export function UserForm({ onSubmit, onCancel, fixedRole }: UserFormProps) {
  const {
    register,
    handleSubmit,
    formState,
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    mode: "onTouched",
    defaultValues: fixedRole ? { role: fixedRole } : undefined,
  });
  const { errors, isSubmitting, dirtyFields, isSubmitted } = formState;

  useUnsavedChangesWarning(Object.keys(dirtyFields).length > 0);

  const errorMessages = Object.entries(errors)
    .map(([field, err]) => {
      const label =
        {
          first_name: "الاسم الأول",
          last_name: "اسم العائلة",
          email: "البريد الإلكتروني",
          role: "الدور",
        }[field] ?? field;
      return err?.message ? `${label}: ${err.message}` : null;
    })
    .filter(Boolean) as string[];

  const roleOptions = Object.entries(ROLE_LABEL).map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <FormErrorSummary messages={isSubmitted ? errorMessages : []} />

      <Input
        label="الاسم الأول"
        hint="اختياري — يمكن إضافته لاحقًا"
        error={errors.first_name?.message}
        {...register("first_name")}
      />

      <Input
        label="البريد الإلكتروني"
        type="email"
        autoComplete="email"
        hint="سيُستخدم لتسجيل الدخول — لا يمكن تغييره لاحقًا"
        required
        error={errors.email?.message}
        {...register("email")}
      />

      <p className="text-xs leading-5 text-ink-500">
        سنرسل إلى هذا البريد رابطًا آمنًا لتعيين كلمة المرور. لن تحتاج إلى إنشاء
        كلمة مرور أو مشاركتها مع المستخدم.
      </p>

      {!fixedRole && (
        <Select
          label="الدور"
          required
          placeholder="اختر دورًا"
          options={roleOptions}
          error={errors.role?.message}
          {...register("role")}
        />
      )}
      {fixedRole && <input type="hidden" value={fixedRole} {...register("role")} />}

      <FormFooter
        isSubmitting={isSubmitting}
        submitLabel={
          fixedRole
            ? `إضافة ${ROLE_LABEL[fixedRole]}`
            : "إضافة العضو"
        }
        onCancel={onCancel}
      />
    </form>
  );
}