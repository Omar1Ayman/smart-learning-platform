import { AuthGuard } from "@/components/layout/AuthGuard";
import { RoleRouteGuard } from "@/components/layout/RoleRouteGuard";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileSidebarToggle } from "@/components/layout/MobileSidebarToggle";
import { Topbar } from "@/components/layout/Topbar";
import { YearReadOnlyBanner } from "@/components/layout/YearReadOnlyBanner";
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <RoleRouteGuard>
        <div className="flex min-h-screen flex-col md:flex-row">
          <div className="hidden md:block">
            <Sidebar />
          </div>
          <div className="flex flex-1 flex-col">
            <MobileSidebarToggle />
            <Topbar />
            <main className="flex-1 overflow-x-auto p-4 sm:p-6">
              {children}
              <YearReadOnlyBanner />
            </main>
          </div>
        </div>
      </RoleRouteGuard>
    </AuthGuard>
  );
}
