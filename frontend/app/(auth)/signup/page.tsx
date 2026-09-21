"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";

// Kept local to this page on purpose — signup is a one-off flow, not a
// shape reused elsewhere the way academicYearSchema/termSchema are.
const signupSchema = z.object({
  tenant_name: z.string().min(2, "اسم المؤسسة قصير جدًا"),
  owner_email: z.string().email("بريد إلكتروني غير صالح"),
  owner_password: z.string().min(10, "10 أحرف على الأقل"),
});

type SignupFormValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({ resolver: zodResolver(signupSchema) });

  async function onSubmit(values: SignupFormValues) {
    setServerError(null);
    try {
      const { data } = await apiClient.post("/auth/signup/", values);
      const { data: me } = await apiClient.get("/auth/me/", {
        headers: { Authorization: `Bearer ${data.access}` },
      });
      setAuth(data.access, me);
      router.replace("/dashboard");
    } catch (err: any) {
      const detail = err?.response?.data?.error?.detail;
      setServerError(typeof detail === "string" ? detail : "تعذّر إنشاء الحساب. تحقق من البيانات.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="card w-full max-w-sm p-8">
        <h1 className="font-display text-xl font-bold text-ink">إنشاء مؤسسة جديدة</h1>
        <p className="mt-1 text-sm text-ink-400">حساب المالك ينشأ تلقائيًا مع المؤسسة</p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
          <Input label="اسم المؤسسة" error={errors.tenant_name?.message} {...register("tenant_name")} />
          <Input
            label="البريد الإلكتروني"
            type="email"
            autoComplete="email"
            error={errors.owner_email?.message}
            {...register("owner_email")}
          />
          <Input
            label="كلمة المرور"
            type="password"
            autoComplete="new-password"
            error={errors.owner_password?.message}
            {...register("owner_password")}
          />
          {serverError && <p className="text-sm text-danger">{serverError}</p>}
          <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
            {isSubmitting ? "جارٍ الإنشاء..." : "إنشاء الحساب"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-400">
          لديك حساب بالفعل؟{" "}
          <Link href="/login" className="font-medium text-ink hover:underline">
            تسجيل الدخول
          </Link>
        </p>
      </div>
    </main>
  );
}
