"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { canAccessRoute } from "@/lib/auth/navigation";
import { useAuthStore } from "@/lib/auth/store";

export function RoleRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);

  if (!user || canAccessRoute(user, pathname)) return <>{children}</>;

  return (
    <main className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-bold text-ink">لا تملك صلاحية الوصول</h1>
      <p className="text-sm text-ink-500">
        هذا القسم غير متاح لدورك في المؤسسة.
      </p>
      <Link
        href="/dashboard"
        className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white"
      >
        العودة إلى لوحة التحكم
      </Link>
    </main>
  );
}
