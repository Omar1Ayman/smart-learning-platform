"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ErrorState, Spinner } from "@/components/ui/States";
import { getProfile, updateProfile } from "@/lib/api/profile";
import { useAuthStore } from "@/lib/auth/store";
import { toastError, toastSuccess } from "@/lib/utils/toast";
import { initialsFromName } from "@/lib/utils/initials";

export default function PlatformProfilePage() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);
  const currentUser = useAuthStore((state) => state.user);
  const [draft, setDraft] = useState<{
    first_name: string;
    last_name: string;
  } | null>(null);

  const profileQuery = useQuery({
    queryKey: ["auth", "profile"],
    queryFn: getProfile,
  });

  const firstName = draft?.first_name ?? profileQuery.data?.first_name ?? "";
  const lastName = draft?.last_name ?? profileQuery.data?.last_name ?? "";

  const updateMutation = useMutation({
    mutationFn: () =>
      updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      }),
    onSuccess: (profile) => {
        setDraft(null);
        queryClient.setQueryData(["auth", "profile"], profile);
      queryClient.invalidateQueries({ queryKey: ["auth", "profile"] });
      if (currentUser) {
        setUser({
          ...currentUser,
          first_name: profile.first_name,
          last_name: profile.last_name,
        });
      }
      toastSuccess("تم تحديث الملف الشخصي.");
    },
    onError: (error) => toastError(error, "تعذّر تحديث الملف الشخصي."),
  });

  if (profileQuery.isLoading) return <Spinner />;
  if (profileQuery.isError || !profileQuery.data) {
    return <ErrorState message="تعذّر تحميل الملف الشخصي." />;
  }

  const profile = profileQuery.data;
  const hasChanges =
    firstName.trim() !== profile.first_name ||
    lastName.trim() !== profile.last_name;
  const initials = initialsFromName(
    [firstName || profile.first_name, lastName || profile.last_name]
      .filter(Boolean)
      .join(" ") || profile.email || "؟"
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">الملف الشخصي</h1>
        <p className="mt-1 text-sm text-ink-400">
          إدارة بيانات حساب مسؤول المنصة.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
        <section className="card flex flex-col items-center p-6 text-center">
          <div className="mb-4 grid h-20 w-20 place-items-center rounded-full bg-ink text-2xl font-bold text-white">
            {initials.toUpperCase()}
          </div>
          <h2 className="font-bold text-ink">
            {[profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
              profile.email}
          </h2>
          <p className="mt-1 break-all text-sm text-ink-400">{profile.email}</p>
          <span className="mt-4 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-dark">
            مسؤول المنصة
          </span>
          <Link
            href="/platform/settings"
            className="mt-5 text-sm font-medium text-ink underline underline-offset-4"
          >
            إعدادات الأمان
          </Link>
        </section>

        <section className="card p-6">
          <h2 className="mb-4 font-display text-lg font-bold text-ink">
            البيانات الشخصية
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="الاسم الأول"
              value={firstName}
              onChange={(event) =>
                setDraft((current) => ({
                  first_name: event.target.value,
                  last_name: current?.last_name ?? profile.last_name,
                }))
              }
            />
            <Input
              label="اسم العائلة"
              value={lastName}
              onChange={(event) =>
                setDraft((current) => ({
                  first_name: current?.first_name ?? profile.first_name,
                  last_name: event.target.value,
                }))
              }
            />
            <div className="sm:col-span-2">
              <Input label="البريد الإلكتروني" value={profile.email} disabled />
              <p className="mt-1 text-xs text-ink-400">
                تغيير البريد يتطلب إعادة تحقق، لذلك لا يمكن تعديله من هذه الصفحة.
              </p>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Button
              disabled={!hasChanges || updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
            >
              {updateMutation.isPending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
