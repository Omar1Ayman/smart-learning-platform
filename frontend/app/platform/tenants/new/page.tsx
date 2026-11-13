"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createPlatformTenant } from "@/lib/api/platformAdmin";
import { toastError, toastSuccess } from "@/lib/utils/toast";

const schema = z.object({
  tenant_name: z.string().min(2, "اسم المؤسسة قصير جدًا").max(255),
  owner_email: z.string().email("بريد إلكتروني غير صالح"),
  owner_password: z.string().min(10, "10 أحرف على الأقل"),
  owner_first_name: z.string().optional(),
  owner_last_name: z.string().optional(),
  status: z.enum(["TRIAL", "ACTIVE", "PENDING"]).default("TRIAL"),
  trial_days: z.coerce.number().int().min(0).max(365).default(14),
  contact_email: z.string().email().optional().or(z.literal("")),
  internal_notes: z.string().optional(),
});

type Values = z.output<typeof schema>;

export default function NewTenantPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, Values>({
    resolver: zodResolver(schema),
    defaultValues: { status: "TRIAL", trial_days: 14 },
  });

  const selectedStatus = watch("status");

  const mutation = useMutation({
    mutationFn: createPlatformTenant,
    onSuccess: (t) => {
      queryClient.invalidateQueries({ queryKey: ["platform-tenants"] });
      queryClient.invalidateQueries({ queryKey: ["platform-metrics"] });
      toastSuccess(`تم إنشاء المؤسسة: ${t.name}`);
      router.push(`/platform/tenants/${t.id}`);
    },
    onError: (err) => {
      toastError(err, "تعذّر إنشاء المؤسسة.");
      setServerError(null);
    },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">
            إنشاء مؤسسة جديدة
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            ينشأ حساب المالك تلقائيًا مع المؤسسة
          </p>
        </div>
        <Button variant="ghost" onClick={() => router.push("/platform/tenants")}>
          ← رجوع
        </Button>
      </div>

      <form
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        className="card flex flex-col gap-4 p-6"
        noValidate
      >
        <Input
          label="اسم المؤسسة"
          placeholder="مثال: مدرسة النيل الدولية"
          error={errors.tenant_name?.message}
          {...register("tenant_name")}
        />

        <div className="rounded-lg border border-line bg-ink-50/30 p-4">
          <p className="mb-3 text-sm font-medium text-ink-700">بيانات المالك</p>
          <div className="flex flex-col gap-3">
            <Input
              label="البريد الإلكتروني"
              type="email"
              autoComplete="off"
              error={errors.owner_email?.message}
              {...register("owner_email")}
            />
            <Input
              label="كلمة المرور المبدئية"
              type="password"
              autoComplete="new-password"
              error={errors.owner_password?.message}
              {...register("owner_password")}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="الاسم الأول"
                error={errors.owner_first_name?.message}
                {...register("owner_first_name")}
              />
              <Input
                label="اسم العائلة"
                error={errors.owner_last_name?.message}
                {...register("owner_last_name")}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-700">الحالة المبدئية</label>
            <select
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
              {...register("status")}
            >
              <option value="TRIAL">تجريبي</option>
              <option value="ACTIVE">نشط</option>
              <option value="PENDING">قيد المراجعة</option>
            </select>
            {errors.status && (
              <p className="text-xs text-danger">{errors.status.message}</p>
            )}
          </div>
          {selectedStatus === "TRIAL" && (
            <Input
              label="عدد أيام الفترة التجريبية"
              type="number"
              min={0}
              max={365}
              error={errors.trial_days?.message}
              {...register("trial_days")}
            />
          )}
        </div>

        <Input
          label="البريد الإلكتروني للتواصل (اختياري)"
          type="email"
          error={errors.contact_email?.message}
          {...register("contact_email")}
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-ink-700">
            ملاحظات داخلية (اختياري)
          </label>
          <textarea
            rows={3}
            placeholder="مثال: عميل من إحالة، دفع سنوي مقدمًا..."
            className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink"
            {...register("internal_notes")}
          />
        </div>

        {serverError && (
          <p className="rounded-lg bg-danger/5 px-3 py-2 text-sm text-danger">
            {serverError}
          </p>
        )}

        <Button
          type="submit"
          disabled={mutation.isPending}
          className="mt-2 w-full"
        >
          {mutation.isPending ? "جارٍ الإنشاء..." : "إنشاء المؤسسة"}
        </Button>
      </form>
    </div>
  );
}