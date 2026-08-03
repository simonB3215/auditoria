import axios from "axios";
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

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError<ApiErrorBody>(err)) {
    return err.response?.data?.error?.message ?? fallback;
  }
  return fallback;
}
