"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";
import { AuthBootstrap } from "@/components/layout/AuthBootstrap";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <AuthBootstrap>
        {children}
        <Toaster
          position="top-center"
          richColors
          closeButton
          duration={3000}
          visibleToasts={3}
          expand={false}
          toastOptions={{
            style: { fontFamily: "inherit", direction: "rtl" },
          }}
        />
      </AuthBootstrap>
    </QueryClientProvider>
  );
}