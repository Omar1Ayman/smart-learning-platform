"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Public self-serve signup is disabled — the platform is sales-led for
 * schools & large centers. Anyone reaching /signup is redirected to the
 * Request Demo form instead.
 *
 * Small independent teachers who *should* be able to sign up on their
 * own will be handled through a separate flow (invite codes or a
 * dedicated /signup/teacher endpoint) in a future wave.
 */
export default function SignupPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/request-demo");
  }, [router]);
  return null;
}