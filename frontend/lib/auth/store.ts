"use client";

import { create } from "zustand";
import type { CurrentUser } from "@/types";

/**
 * Auth state — deliberately NOT persisted to localStorage/sessionStorage.
 * The access token lives in memory only, for the life of the tab.
 * Session survival across reload comes from the httpOnly refresh cookie
 * instead (see lib/api/client.ts bootstrapAuth).
 *
 * C-8: `sessionId` is the current device's UserSession.id. It must be
 * kept in sync with the refresh flow (client.ts) and cleared on logout —
 * otherwise `/settings/sessions` would keep highlighting a stale row as
 * "this device" after the user re-authenticates on a different machine.
 */
interface AuthState {
  accessToken: string | null;
  user: CurrentUser | null;
  status: "idle" | "checking" | "authenticated" | "anonymous";
  /** Short-lived pre-auth token issued by /auth/login/ when the user
   *  has 2FA enabled. Exchanged at /auth/login/2fa/ for real tokens. */
  pending2faToken: string | null;
  /** The UserSession.id for the current device. Populated by login /
   *  2FA / refresh responses. Used by the sessions list to mark the
   *  current device. */
  sessionId: string | null;

  setUser: (user: CurrentUser) => void;
  setStatus: (status: AuthState["status"]) => void;
  setPending2faToken: (token: string | null) => void;
  clearAuth: () => void;
  setAuth: (token: string, user: CurrentUser | null, sessionId?: string | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  status: "idle",
  pending2faToken: null,
  sessionId: null,

  setAuth: (token, user, sessionId = null) =>
    set({
      accessToken: token,
      user,
      sessionId,
      status: "authenticated",
      pending2faToken: null,
    }),

  setUser: (user) => set({ user }),
  setStatus: (status) => set({ status }),
  setPending2faToken: (pending2faToken) => set({ pending2faToken }),

  clearAuth: () =>
    set({
      accessToken: null,
      user: null,
      status: "anonymous",
      pending2faToken: null,
      // C-8: must clear sessionId too, or the sessions page will keep
      // pointing at a dead session as "this device".
      sessionId: null,
    }),
}));