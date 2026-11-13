"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AdminDashboardView } from "@/components/dashboard/AdminDashboardView";
import { StudentDashboardView } from "@/components/dashboard/StudentDashboardView";
import { TeacherDashboardView } from "@/components/dashboard/TeacherDashboardView";
import { TodaySessionsWidget } from "@/components/dashboard/TodaySessionsWidget";
import { Spinner } from "@/components/ui/States";
import { useAuthStore } from "@/lib/auth/store";

export default function DashboardPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  // Parents have their own landing page (/parent). Redirect before
  // rendering any staff/student dashboard — those call endpoints that
  // require different roles and would 403.
  useEffect(() => {
    if (user?.role === "PARENT") {
      router.replace("/parent");
    }
  }, [user?.role, router]);

  if (!user) return <Spinner />;
  if (user.role === "PARENT") return <Spinner />;

  const name = user.first_name || undefined;

  const view =
    user.role === "OWNER" || user.role === "ADMIN" ? (
      <AdminDashboardView name={name} />
    ) : user.role === "TEACHER" ? (
      <TeacherDashboardView name={name} />
    ) : (
      <StudentDashboardView name={name} />
    );

  return (
    <div className="page-enter flex flex-col gap-6">
      {user.role !== "STUDENT" && <TodaySessionsWidget />}
      {view}
    </div>
  );
}