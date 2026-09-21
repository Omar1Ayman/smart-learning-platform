"use client";

import { useAuthStore } from "@/lib/auth/store";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "مالك المؤسسة",
  ADMIN: "مسؤول",
  TEACHER: "معلّم",
  STUDENT: "طالب",
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">
          مرحبًا{user?.first_name ? `، ${user.first_name}` : ""} 👋
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          {user?.tenant?.name} — {user ? ROLE_LABEL[user.role] : ""}
        </p>
      </div>

      {/* Placeholder metric cards — the real Admin/Teacher/Student
          dashboards (spec #51-53) land in Phase 11; this shell just
          proves the layout, role context, and empty/loading pattern. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["الطلاب", "المعلمون", "الامتحانات القادمة"].map((label) => (
          <div key={label} className="card p-5">
            <p className="text-sm text-ink-400">{label}</p>
            <p className="mt-2 font-display text-2xl font-bold text-ink">—</p>
          </div>
        ))}
      </div>
    </div>
  );
}
