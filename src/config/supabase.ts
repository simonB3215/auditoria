import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.js";

/**
 * Cliente con service_role: bypassa RLS. Reservado para operaciones
 * administrativas explícitas (ej. jobs de background, invitaciones).
 * Nunca exponer este cliente a lógica que dependa de input del usuario
 * sin filtrar manualmente por organization_id.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * Cliente por-request autenticado como el usuario (anon key + JWT del usuario).
 * Al usar este cliente, `auth.uid()` resuelve correctamente dentro de las
 * políticas RLS, por lo que el aislamiento multi-tenant se aplica en la DB,
 * no solo en el código de la aplicación (defensa en profundidad).
 */
export function supabaseForUser(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
