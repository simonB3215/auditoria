-- ============================================================
-- Enlaces de invitación (reemplaza el envío de invitación por email de
-- Supabase Auth): un platform admin genera un link que cualquiera puede
-- usar para unirse a la organización con el rol indicado — el email deja
-- de ser un dato obligatorio del invitado, es solo referencia opcional de
-- a quién se pensaba invitar. El token es el propio `id` de la fila (UUID
-- no adivinable), y la validación (vigencia, uso único) se hace toda del
-- lado del servidor — nunca se confía en organization_id/role que venga
-- del cliente al aceptar.
-- ============================================================

create table invite_links (
    id              uuid primary key default uuid_generate_v4(),
    organization_id uuid not null references organizations(id) on delete cascade,
    role            text not null check (role in ('auditor', 'auditor_guest')),
    email           text,
    created_by      uuid not null references profiles(id),
    expires_at      timestamptz not null,
    used_at         timestamptz,
    used_by         uuid references profiles(id),
    created_at      timestamptz not null default now()
);
create index idx_invite_links_org on invite_links(organization_id);

alter table invite_links enable row level security;
-- Sin policies: se lee/escribe solo desde el backend con service_role
-- (igual que audit_logs/scan_runs) — el token ya viaja en la URL, no hace
-- falta además exponer la tabla a clientes autenticados.
