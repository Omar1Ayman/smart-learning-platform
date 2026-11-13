import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/lib/auth/store";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // required so the httpOnly refresh cookie is sent
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

interface RefreshResult {
  access: string;
  sessionId: string | null;
}

let refreshPromise: Promise<RefreshResult | null> | null = null;

async function refreshAccessToken(): Promise<RefreshResult | null> {
  try {
    const { data } = await axios.post<{ access: string; session_id?: string }>(
      `${API_BASE_URL}/auth/refresh/`,
      {},
      { withCredentials: true }
    );
    return { access: data.access, sessionId: data.session_id ?? null };
  } catch (err) {
    // DEBUG: log so the user can see WHY refresh failed in dev.
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[auth] refresh failed:",
        (err as AxiosError)?.response?.status,
        (err as AxiosError)?.response?.data
      );
    }
    return null;
  }
}

function getRefreshedToken(): Promise<RefreshResult | null> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryableConfig | undefined;
    const isAuthEndpoint =
      original?.url?.includes("/auth/login") || original?.url?.includes("/auth/refresh");

    if (error.response?.status === 401 && original && !original._retried && !isAuthEndpoint) {
      original._retried = true;

      const refreshed = await getRefreshedToken();

      if (refreshed) {
        useAuthStore.setState({
          accessToken: refreshed.access,
          ...(refreshed.sessionId ? { sessionId: refreshed.sessionId } : {}),
        });
        original.headers.Authorization = `Bearer ${refreshed.access}`;
        return apiClient(original);
      }

      useAuthStore.getState().clearAuth();
    }

    return Promise.reject(error);
  }
);

/**
 * Called once on app load: tries to silently re-establish a session from
 * the httpOnly refresh cookie.
 *
 * FIX (post-login bounce): this function used to call clearAuth()
 * whenever the refresh failed, no matter what. That meant that in the
 * brief window right after a successful login — when status was
 * "authenticated" and a token existed in memory — a failing refresh
 * (transient network hiccup, cookie not yet fully applied, SameSite
 * edge case) would wipe the perfectly valid session and send the user
 * back to /login.
 *
 * Now: only clearAuth() if we have NO token at all. If we still hold
 * an access token in memory, keep the session alive; the 401
 * interceptor will retry refresh later if/when needed.
 */
export async function bootstrapAuth() {
  // Preserve existing state — don't blow away a valid session that was
  // just set by the login page's setAuth().
  const before = useAuthStore.getState();
  if (before.status === "authenticated" && before.accessToken) {
    return;
  }

  useAuthStore.getState().setStatus("checking");

  const refreshed = await getRefreshedToken();

  if (!refreshed) {
    // No token from refresh. Only clear if we truly have nothing.
    const current = useAuthStore.getState();
    if (!current.accessToken) {
      useAuthStore.getState().clearAuth();
    } else {
      // We have a token in memory; keep the session. The 401 interceptor
      // will retry refresh when it actually needs to.
      useAuthStore.getState().setStatus("authenticated");
    }
    return;
  }

  useAuthStore.setState({
    accessToken: refreshed.access,
    ...(refreshed.sessionId ? { sessionId: refreshed.sessionId } : {}),
  });

  try {
    const { data } = await apiClient.get("/auth/me/");
    useAuthStore.getState().setAuth(refreshed.access, data, refreshed.sessionId);
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[auth] /auth/me/ failed after refresh:", err);
    }
    useAuthStore.getState().clearAuth();
  }
}