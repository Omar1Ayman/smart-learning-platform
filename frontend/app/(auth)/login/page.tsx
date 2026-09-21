"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import { loginSchema, type LoginFormValues } from "@/lib/validation/schemas";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginFormValues) {
    setServerError(null);
    try {
      const { data } = await apiClient.post("/auth/login/", values);
      const { data: me } = await apiClient.get("/auth/me/", {
        headers: { Authorization: `Bearer ${data.access}` },
      });
      setAuth(data.access, me);
      router.replace("/dashboard");
    } catch {
      setServerError("بيانات الدخول غير صحيحة.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="card w-full max-w-sm p-8">
        <h1 className="font-display text-xl font-bold text-ink">تسجيل الدخول</h1>
        <p className="mt-1 text-sm text-ink-400">منصة التعلم الذكية</p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
          <Input label="البريد الإلكتروني" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
          <Input
            label="كلمة المرور"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />
          {serverError && <p className="text-sm text-danger">{serverError}</p>}
          <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
            {isSubmitting ? "جارٍ الدخول..." : "دخول"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-400">
          مؤسسة جديدة؟{" "}
          <Link href="/signup" className="font-medium text-ink hover:underline">
            إنشاء حساب
          </Link>
        </p>
      </div>
    </main>
  );
}
