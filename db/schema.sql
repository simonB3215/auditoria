-- ============================================================
-- Aegis CyberAudit — Esquema MVP (Fase 1)
-- Ejecutar en el SQL editor de Supabase (o via `supabase db push`)
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
create type user_role as enum ('ciso', 'auditor', 'viewer');
create type audit_status as enum ('draft', 'queued', 'running', 'completed', 'failed');
create type evidence_validation_status as enum ('pending', 'valid', 'invalid');
create type finding_severity as enum ('critical', 'high', 'medium', 'low');
create type finding_status as enum ('open', 'accepted_risk', 'remediated', 'false_positive');

-- ============================================================
-- ORGANIZACIONES
-- Aunque no está listada explícitamente en a.md, es necesaria para que
-- los roles ciso/auditor/viewer tengan sentido: un CISO supervisa las
-- auditorías de TODO su equipo, no solo las que creó él mismo.
-- ============================================================
create table organizations (
    id          uuid primary key default uuid_generate_v4(),
    name        text not null,
    created_at  timestamptz not null default now()
);

-- ============================================================
-- PROFILES (extiende auth.users)
-- ============================================================
create table profiles (
    id              uuid primary key references auth.users(id) on delete cascade,
    organization_id uuid not null references organizations(id) on delete cascade,
    full_name       text,
    role            user_role not null default 'viewer',
    created_at      timestamptz not null default now()
);
create index idx_profiles_org on profiles(organization_id);

-- Helper: organización del usuario autenticado actual.
create or replace function current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select organization_id from profiles where id = auth.uid();
$$;

-- Helper: rol del usuario autenticado actual.
create or replace function current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
    select role from profiles where id = auth.uid();
$$;

-- ============================================================
-- ASSETS
-- ============================================================
create table assets (
    id              uuid primary key default uuid_generate_v4(),
    organization_id uuid not null references organizations(id) on delete cascade,
    created_by      uuid not null references profiles(id),
    type            text not null check (type in ('ip', 'cidr', 'domain')),
    value           text not null,
    created_at      timestamptz not null default now(),
    unique (organization_id, type, value)
);
create index idx_assets_org on assets(organization_id);

-- ============================================================
-- AUDITS
-- ============================================================
create table audits (
    id              uuid primary key default uuid_generate_v4(),
    organization_id uuid not null references organizations(id) on delete cascade,
    created_by      uuid not null references profiles(id),
    title           text not null,
    framework       text not null,           -- ej: 'iso27001', 'nist_csf'
    status          audit_status not null default 'draft',
    risk_score      numeric,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index idx_audits_org on audits(organization_id);
create index idx_audits_status on audits(status);

-- ============================================================
-- AUDIT_ASSETS (activos incluidos en el alcance de una auditoría)
-- ============================================================
create table audit_assets (
    audit_id    uuid not null references audits(id) on delete cascade,
    asset_id    uuid not null references assets(id) on delete cascade,
    primary key (audit_id, asset_id)
);

-- ============================================================
-- AUDIT_EVIDENCES
-- ============================================================
create table audit_evidences (
    id                  uuid primary key default uuid_generate_v4(),
    audit_id            uuid not null references audits(id) on delete cascade,
    uploaded_by         uuid not null references profiles(id),
    file_name           text not null,
    mime_type           text not null,
    size_bytes          integer not null,
    storage_path        text not null,       -- path en Supabase Storage (bucket privado)
    requirement_code    text,                -- requisito de la norma que cubre (ej: 'A.9.2.1')
    validation_status   evidence_validation_status not null default 'pending',
    validation_errors   jsonb,                -- detalle de errores estructurales/semánticos
    created_at          timestamptz not null default now()
);
create index idx_evidences_audit on audit_evidences(audit_id);
create index idx_evidences_status on audit_evidences(validation_status);

-- ============================================================
-- FINDINGS
-- ============================================================
create table findings (
    id              uuid primary key default uuid_generate_v4(),
    audit_id        uuid not null references audits(id) on delete cascade,
    asset_id        uuid references assets(id) on delete set null,
    source_engine   text not null,           -- 'nmap' | 'nuclei' | 'zap' | 'manual'
    title           text not null,
    severity        finding_severity not null,
    status          finding_status not null default 'open',
    cve_id          text,
    detail          text,
    remediation     text,
    detected_at     timestamptz not null default now()
);
create index idx_findings_audit on findings(audit_id);
create index idx_findings_severity on findings(severity);

-- ============================================================
-- REPORTS
-- ============================================================
create table reports (
    id              uuid primary key default uuid_generate_v4(),
    audit_id        uuid not null references audits(id) on delete cascade,
    generated_by    uuid not null references profiles(id),
    storage_path    text not null,
    risk_score      numeric,
    generated_at    timestamptz not null default now()
);
create index idx_reports_audit on reports(audit_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- Regla general: SELECT visible para toda la organización (para que
-- ciso/auditor colaboren); escritura (INSERT/UPDATE/DELETE) restringida
-- a created_by = auth.uid() salvo para el rol 'ciso', que administra
-- todo lo de su organización.
-- ============================================================
alter table assets enable row level security;
alter table audits enable row level security;
alter table audit_assets enable row level security;
alter table audit_evidences enable row level security;
alter table findings enable row level security;
alter table reports enable row level security;

-- assets
create policy assets_select on assets
    for select using (organization_id = current_organization_id());
create policy assets_insert on assets
    for insert with check (organization_id = current_organization_id() and created_by = auth.uid());
create policy assets_modify on assets
    for update using (organization_id = current_organization_id() and (created_by = auth.uid() or current_user_role() = 'ciso'));
create policy assets_delete on assets
    for delete using (organization_id = current_organization_id() and (created_by = auth.uid() or current_user_role() = 'ciso'));

-- audits
create policy audits_select on audits
    for select using (organization_id = current_organization_id());
create policy audits_insert on audits
    for insert with check (organization_id = current_organization_id() and created_by = auth.uid());
create policy audits_modify on audits
    for update using (organization_id = current_organization_id() and (created_by = auth.uid() or current_user_role() = 'ciso'));
create policy audits_delete on audits
    for delete using (organization_id = current_organization_id() and current_user_role() = 'ciso');

-- audit_assets (hereda visibilidad de audits)
create policy audit_assets_select on audit_assets
    for select using (audit_id in (select id from audits where organization_id = current_organization_id()));
create policy audit_assets_insert on audit_assets
    for insert with check (audit_id in (select id from audits where organization_id = current_organization_id()));
create policy audit_assets_delete on audit_assets
    for delete using (audit_id in (select id from audits where organization_id = current_organization_id()));

-- audit_evidences
create policy evidences_select on audit_evidences
    for select using (audit_id in (select id from audits where organization_id = current_organization_id()));
create policy evidences_insert on audit_evidences
    for insert with check (
        uploaded_by = auth.uid()
        and audit_id in (select id from audits where organization_id = current_organization_id())
    );
create policy evidences_delete on audit_evidences
    for delete using (
        audit_id in (select id from audits where organization_id = current_organization_id())
        and (uploaded_by = auth.uid() or current_user_role() = 'ciso')
    );

-- findings (solo lectura desde el cliente; escritura vía service_role desde el worker de escaneo)
create policy findings_select on findings
    for select using (audit_id in (select id from audits where organization_id = current_organization_id()));
create policy findings_modify on findings
    for update using (
        audit_id in (select id from audits where organization_id = current_organization_id())
        and current_user_role() in ('ciso', 'auditor')
    );

-- reports
create policy reports_select on reports
    for select using (audit_id in (select id from audits where organization_id = current_organization_id()));
create policy reports_insert on reports
    for insert with check (
        generated_by = auth.uid()
        and audit_id in (select id from audits where organization_id = current_organization_id())
    );
