-- ============================================================
-- Logs de auditoría inmutables (trazabilidad ISO 27001).
--
-- Inmutabilidad: RLS habilitado con políticas SOLO de INSERT y SELECT.
-- A propósito no existe ninguna policy de UPDATE/DELETE — sin una policy
-- que lo permita, Postgres deniega esas operaciones para cualquier rol
-- sujeto a RLS. Los inserts en la práctica los hace el backend con
-- service_role (que bypassea RLS igual que el resto del panel de admin),
-- pero la policy de INSERT queda para que un cliente autenticado también
-- pudiera insertar en su propia organización si algún día se necesitara,
-- sin abrir la puerta a alterar ni borrar el historial desde ningún rol.
-- ============================================================

create table audit_logs (
    id              uuid primary key default uuid_generate_v4(),
    organization_id uuid not null references organizations(id) on delete cascade,
    actor_id        uuid references profiles(id) on delete set null,
    action          text not null,
    resource_type   text not null,
    resource_id     uuid,
    payload_before  jsonb,
    payload_after   jsonb,
    ip_address      text,
    user_agent      text,
    created_at      timestamptz not null default now()
);
create index idx_audit_logs_org on audit_logs(organization_id);
create index idx_audit_logs_resource on audit_logs(resource_type, resource_id);
create index idx_audit_logs_created on audit_logs(created_at);

alter table audit_logs enable row level security;

create policy audit_logs_select on audit_logs
    for select using (organization_id = current_organization_id());

create policy audit_logs_insert on audit_logs
    for insert with check (organization_id = current_organization_id());

-- Sin policies de update/delete: UPDATE y DELETE quedan bloqueados para
-- todos los roles sujetos a RLS (anon, authenticated). service_role sigue
-- pudiendo hacerlo a nivel de Postgres (RLS no aplica a service_role), pero
-- el backend nunca ejecuta esas operaciones sobre esta tabla.
