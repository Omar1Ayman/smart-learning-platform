import { PlatformGuard } from "@/components/layout/PlatformGuard";
import { PlatformNav } from "@/components/platform/PlatformNav";
import { PlatformTopbar } from "@/components/platform/PlatformTopbar";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlatformGuard>
      <div className="flex min-h-screen flex-col bg-paper md:flex-row">
        <PlatformNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <PlatformTopbar />
          <main className="flex-1 overflow-x-auto p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </PlatformGuard>
  );
}