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

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  try {
    const { data } = await axios.post<{ access: string }>(
      `${API_BASE_URL}/auth/refresh/`,
      {},
      { withCredentials: true }
    );
    return data.access;
  } catch {
    return null;
  }
}

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetryableConfig | undefined;
    const isAuthEndpoint = original?.url?.includes("/auth/login") || original?.url?.includes("/auth/refresh");

    if (error.response?.status === 401 && original && !original._retried && !isAuthEndpoint) {
      original._retried = true;

      // Coalesce concurrent 401s into a single refresh call.
      refreshPromise = refreshPromise ?? refreshAccessToken();
      const newAccessToken = await refreshPromise;
      refreshPromise = null;

      if (newAccessToken) {
        useAuthStore.setState({ accessToken: newAccessToken });
        original.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(original);
      }

      useAuthStore.getState().clearAuth();
    }

    return Promise.reject(error);
  }
);

/** Called once on app load: tries to silently re-establish a session from
 * the httpOnly refresh cookie, so a page reload doesn't force a re-login. */
export async function bootstrapAuth() {
  useAuthStore.getState().setStatus("checking");
  const token = await refreshAccessToken();
  if (!token) {
    useAuthStore.getState().clearAuth();
    return;
  }
  useAuthStore.setState({ accessToken: token });
  try {
    const { data } = await apiClient.get("/auth/me/");
    useAuthStore.getState().setAuth(token, data);
  } catch {
    useAuthStore.getState().clearAuth();
  }
}
