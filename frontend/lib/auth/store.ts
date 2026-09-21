import { create } from "zustand";
import type { CurrentUser } from "@/types";

/**
 * Deliberately NOT persisted to localStorage/sessionStorage — the access
 * token lives in memory only, for the life of the tab. See
 * PROJECT_MEMORY.md #14: an XSS bug should never be able to read a live
 * credential off disk. Session survival across a page reload comes from
 * the httpOnly refresh cookie instead (see lib/api/client.ts bootstrap).
 */
interface AuthState {
  accessToken: string | null;
  user: CurrentUser | null;
  status: "idle" | "checking" | "authenticated" | "anonymous";
  setAuth: (accessToken: string, user: CurrentUser | null) => void;
  setUser: (user: CurrentUser) => void;
  setStatus: (status: AuthState["status"]) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  status: "idle",
  setAuth: (accessToken, user) => set({ accessToken, user, status: "authenticated" }),
  setUser: (user) => set({ user }),
  setStatus: (status) => set({ status }),
  clearAuth: () => set({ accessToken: null, user: null, status: "anonymous" }),
}));
