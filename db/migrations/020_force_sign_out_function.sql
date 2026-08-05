-- ============================================================
-- Restablecimiento administrativo de contraseña (a.md, "PROMPT DE
-- DIAGNÓSTICO Y CORRECCIÓN: PERSISTENCIA DE SESIÓN...", sección 3): cuando
-- un admin de plataforma restablece la contraseña de otra persona desde
-- /admin/users, sus sesiones activas en otros dispositivos deben quedar
-- invalidadas.
--
-- supabase-js (auth-js 2.112) solo expone `auth.admin.signOut(jwt, scope)`,
-- que requiere el JWT de la sesión a cerrar — inútil para un admin actuando
-- sobre la cuenta de otra persona, de la que no tiene ningún token. No hay
-- un método de Admin API que reciba solo el user id. La forma soportada por
-- Supabase para este caso es borrar directamente las filas de
-- `auth.sessions` del usuario (con `on delete cascade` hacia
-- `auth.refresh_tokens`, invalida también los refresh tokens en vuelo).
--
-- Se expone como función SECURITY DEFINER en vez de agregar un pool de
-- Postgres nuevo al backend (que hoy solo usa supabase-js): reusa
-- `supabaseAdmin.rpc(...)`, ya autenticado con service_role, sin abrir una
-- conexión directa a la base desde la app en producción.
-- ============================================================

create or replace function public.force_sign_out_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from auth.sessions where user_id = target_user_id;
end;
$$;

revoke all on function public.force_sign_out_user(uuid) from public;
grant execute on function public.force_sign_out_user(uuid) to service_role;
