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

export interface ApiErrorBody {
  error: { code: string; message: string };
}

let redirectingToLogin = false;

/**
 * Cierra la sesión de Supabase y manda a /login. `PROFILE_NOT_FOUND` es un
 * 401 "de aplicación" (token válido, todavía sin fila en `profiles`) que
 * el layout de /(app) redirige a /onboarding en vez de acá — nunca debe
 * disparar un cierre de sesión. El flag `redirectingToLogin` evita
 * múltiples signOut/redirect si varias requests en paralelo (ej.
 * /users/me y /dashboard/summary) fallan con 401 al mismo tiempo.
 */
async function redirectToUnauthorized(code: string | undefined) {
  if (code === "PROFILE_NOT_FOUND") return;
  if (typeof window === "undefined") return;
  if (redirectingToLogin || window.location.pathname.startsWith("/login")) return;
  redirectingToLogin = true;

  const supabase = createClient();
  await supabase.auth.signOut().catch(() => undefined);
  // a.md ("REDISEÑO COMPLETO DE UI/UX", punto 4): en vez de un redirect
  // silencioso, /login muestra un mensaje amigable explicando por qué
  // volvió a pedir credenciales.
  window.location.href = "/login?reason=session_expired";
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
 * el refresh token ya expiró de verdad, en cuyo caso a.md ("fix manejo de
 * autenticación y redirección 401") pide limpiar la sesión global y mandar
 * a /login en vez de dejar que cada página muestre su propio error.
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const code = (error.response?.data as ApiErrorBody | undefined)?.error?.code;

    if (status !== 401 || !config) {
      return Promise.reject(error);
    }

    if (config._retriedAfterRefresh) {
      await redirectToUnauthorized(code);
      return Promise.reject(error);
    }

    const supabase = createClient();
    const { data, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !data.session) {
      await redirectToUnauthorized(code);
      return Promise.reject(error);
    }

    config._retriedAfterRefresh = true;
    config.headers.Authorization = `Bearer ${data.session.access_token}`;
    return api(config);
  }
);

/**
 * Confirma que el cliente de Supabase del browser ya hidrató la sesión
 * (desde localStorage) antes de disparar una request autenticada. El
 * middleware de Next (cookies, lado servidor) ya garantiza que no se
 * llega a una ruta de /(app) sin sesión, pero esa hidratación del lado
 * cliente es asíncrona — si un componente llama a la API en su primer
 * render sin esperarla, el interceptor de arriba no encuentra token
 * todavía y el backend responde 401 (a.md, punto 2: "evitar llamadas a
 * /users/me si no hay sesión activa confirmada en el frontend"). Si de
 * verdad no hay sesión (caso límite: cookies borradas a mano), redirige
 * directo en vez de disparar una request condenada a fallar.
 */
export async function ensureSession(): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) return true;

  await redirectToUnauthorized(undefined);
  return false;
}

export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiErrorBody>(err)) {
    return err.response?.data?.error?.message ?? fallback;
  }
  return fallback;
}
