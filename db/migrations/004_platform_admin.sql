-- ============================================================
-- Migración 004 — Superadmin de plataforma
--
-- Rol aparte del RBAC por organización (ciso/auditor/viewer): un platform
-- admin puede ver/administrar TODAS las organizaciones, no solo la propia.
--
-- A propósito NO se tocan las políticas RLS existentes: las rutas
-- /api/v1/admin/* usan el cliente service_role directamente en el backend,
-- gateadas por el middleware requirePlatformAdmin (verifica esta columna
-- antes de llegar al handler) — mismo patrón de confianza que ya se usa
-- en onboarding.ts y en el worker de escaneo. Evita reescribir 18 policies
-- para un bypass que la capa de aplicación ya garantiza.
--
-- No hay ningún endpoint que permita auto-otorgarse esto: la única forma
-- de activarlo es el script db/promote-admin.ts, corrido localmente con
-- la service_role key (ver npm run admin:promote).
-- ============================================================

alter table profiles add column is_platform_admin boolean not null default false;

create index idx_profiles_platform_admin on profiles(is_platform_admin) where is_platform_admin = true;
