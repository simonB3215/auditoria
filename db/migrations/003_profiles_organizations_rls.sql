-- ============================================================
-- Migración 003 — RLS en `profiles` y `organizations`
--
-- Gap de seguridad encontrado al diseñar el registro self-service del
-- frontend: estas dos tablas nunca tuvieron RLS habilitado desde la Fase 1.
-- Sin esto, cualquier usuario autenticado podía leer/modificar el perfil
-- o la organización de OTRO tenant, e incluso auto-asignarse el rol 'ciso'
-- actualizando su propia fila de `profiles` — escalación de privilegios.
-- ============================================================

alter table profiles enable row level security;
alter table organizations enable row level security;

create policy profiles_select_own_org on profiles
    for select using (organization_id = current_organization_id());

create policy organizations_select_own on organizations
    for select using (id = current_organization_id());

-- A propósito NO hay políticas de insert/update/delete para el rol
-- `authenticated`: la creación de organizaciones/perfiles solo ocurre vía
-- backend con service_role (ver POST /api/v1/onboarding/organization),
-- nunca desde un cliente autenticado directo.
