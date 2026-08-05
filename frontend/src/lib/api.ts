import axios, { type InternalAxiosRequestConfig } from "axios";
import { createClient } from "@/lib/supabase/client";

/**
 * Cliente HTTP para el backend Express. Uso exclusivo desde Client
 * Components: el interceptor lee la sesión de Supabase del browser y
 * adjunta el JWT como Bearer token en cada request.
 */
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

api.interceptors.request.use(async (config) => {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }

  return config;
});

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retriedAfterRefresh?: boolean;
}

/**
 * `getSession()` ya intenta refrescar cuando detecta el access token
 * vencido, pero queda una ventana real donde igual llega vencido al
 * backend (reloj del cliente adelantado/atrasado respecto al de Supabase,
 * pestaña que estuvo en segundo plano y todavía no corrió el timer de
 * auto-refresh). Sin este interceptor esa ventana se traduce en un cierre
 * de sesión "silencioso": la request falla con 401 y la UI de cada página
 * lo muestra como error, aunque el refresh token siga siendo válido — el
 * síntoma que reporta a.md como "expiración prematura de sesión". Se
 * reintenta una sola vez (flag `_retriedAfterRefresh`) para no loopear si
 * el refresh token ya expiró de verdad, en cuyo caso el 401 se propaga
 * igual que antes y cada página sigue manejándolo como ya lo hacía.
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as RetriableConfig | undefined;
    if (!config || error.response?.status !== 401 || config._retriedAfterRefresh) {
      return Promise.reject(error);
    }

    const supabase = createClient();
    const { data, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !data.session) {
      return Promise.reject(error);
    }

    config._retriedAfterRefresh = true;
    config.headers.Authorization = `Bearer ${data.session.access_token}`;
    return api(config);
  }
);

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiErrorBody>(err)) {
    return err.response?.data?.error?.message ?? fallback;
  }
  return fallback;
}
