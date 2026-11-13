"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { FormErrorSummary } from "@/components/ui/FormErrorSummary";
import { FormFooter } from "@/components/ui/FormFooter";
import { Input } from "@/components/ui/Input";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import type { UserUpdateInput } from "@/lib/api/users";

const userEditSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  is_active: z.boolean().default(true),
  parent_name: z.string().optional(),
  parent_email: z
    .string()
    .optional()
    .refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
      message: "بريد إلكتروني غير صالح",
    }),
  parent_phone: z.string().optional(),
});

type UserEditFormValues = z.infer<typeof userEditSchema>;

interface UserEditFormProps {
  onSubmit: (values: UserUpdateInput) => Promise<void>;
  onCancel?: () => void;
  initialValues?: Partial<
    UserEditFormValues & { email?: string; role?: string }
  >;
}

/**
 * Limited edit form for a tenant user.
 *
 * Email and role are read-only (see UserUpdateSerializer docstring).
 * Parent contact fields are shown only for STUDENT rows.
 */
export function UserEditForm({
  onSubmit,
  onCancel,
  initialValues,
}: UserEditFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting, dirtyFields, isSubmitted },
  } = useForm<z.input<typeof userEditSchema>, unknown, UserEditFormValues>({
    resolver: zodResolver(userEditSchema),
    mode: "onTouched",
    defaultValues: {
      first_name: initialValues?.first_name ?? "",
      last_name: initialValues?.last_name ?? "",
      is_active: initialValues?.is_active ?? true,
      parent_name: initialValues?.parent_name ?? "",
      parent_email: initialValues?.parent_email ?? "",
      parent_phone: initialValues?.parent_phone ?? "",
    },
  });

  useUnsavedChangesWarning(Object.keys(dirtyFields).length > 0);

  // Watch role from initialValues (not part of form state, it's read-only)
  const _ = useWatch({ control, name: "parent_email" });
  void _;
  const isStudent = initialValues?.role === "STUDENT";

  const errorMessages = Object.entries(errors)
    .map(([field, err]) => {
      const label =
        {
          first_name: "الاسم الأول",
          last_name: "اسم العائلة",
          is_active: "الحساب نشط",
          parent_name: "اسم ولي الأمر",
          parent_email: "بريد ولي الأمر",
          parent_phone: "هاتف ولي الأمر",
        }[field] ?? field;
      return err?.message ? `${label}: ${err.message}` : null;
    })
    .filter(Boolean) as string[];

  return (
    <form
      onSubmit={handleSubmit((values) =>
        onSubmit({
          first_name: values.first_name,
          last_name: values.last_name,
          is_active: values.is_active,
          ...(isStudent
            ? {
                parent_name: values.parent_name,
                parent_email: values.parent_email,
                parent_phone: values.parent_phone,
              }
            : {}),
        })
      )}
      className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto pe-1"
      noValidate
    >
      {/* Read-only context */}
      {initialValues?.email && (
        <div className="rounded-lg bg-paper-muted p-3 text-xs text-ink">
          <p>
            <span className="font-medium">البريد:</span> {initialValues.email}
          </p>
          {initialValues.role && (
            <p className="mt-1">
              <span className="font-medium">الدور:</span>{" "}
              {{
                OWNER: "مالك",
                ADMIN: "مسؤول",
                TEACHER: "معلّم",
                STUDENT: "طالب",
                PARENT: "ولي أمر",
              }[initialValues.role] ?? initialValues.role}
            </p>
          )}
          <p className="mt-2 text-ink-400">
            لتغيير البريد أو الدور، تواصل مع المسؤول.
          </p>
        </div>
      )}

      <FormErrorSummary messages={isSubmitted ? errorMessages : []} />

      <Input
        label="الاسم الأول"
        error={errors.first_name?.message}
        {...register("first_name")}
      />

      <Input
        label="اسم العائلة"
        error={errors.last_name?.message}
        {...register("last_name")}
      />

      {/* Parent section — students only */}
      {isStudent && (
        <div className="rounded-lg border border-line bg-paper-muted/20 p-3">
          <p className="mb-1 text-sm font-medium text-ink">
            بيانات ولي الأمر
          </p>
          <p className="mb-3 text-xs text-ink-400">
            تُستخدم لإرسال إشعارات الغياب تلقائيًا
          </p>
          <div className="flex flex-col gap-3">
            <Input
              label="اسم ولي الأمر"
              placeholder="مثال: محمد أحمد"
              error={errors.parent_name?.message}
              {...register("parent_name")}
            />
            <Input
              label="بريد ولي الأمر"
              type="email"
              placeholder="parent@example.com"
              hint="سيستلم إشعارات الغياب على هذا البريد"
              error={errors.parent_email?.message}
              {...register("parent_email")}
            />
            <Input
              label="هاتف ولي الأمر"
              type="tel"
              placeholder="+20 1XX XXX XXXX"
              hint="اختياري — للإشعارات المستقبلية (SMS)"
              error={errors.parent_phone?.message}
              {...register("parent_phone")}
            />
          </div>
        </div>
      )}

      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-line bg-paper-elevated p-3 transition-colors hover:bg-paper-muted/30">
        <div>
          <p className="text-sm font-medium text-ink">الحساب نشط</p>
          <p className="mt-0.5 text-xs text-ink-400">
            إلغاء التفعيل يمنع المستخدم من تسجيل الدخول مع الاحتفاظ ببياناته.
          </p>
        </div>
        <input type="checkbox" {...register("is_active")} className="h-5 w-5" />
      </label>

      <FormFooter
        isSubmitting={isSubmitting}
        submitLabel="حفظ التعديلات"
        onCancel={onCancel}
      />
    </form>
  );
}