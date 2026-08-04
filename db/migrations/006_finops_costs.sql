-- ============================================================
-- FinOps: precios editables por unidad de consumo + registro de
-- ejecuciones de escaneo (necesario para poder prorratear costo de
-- cómputo/worker y de escaneos por auditoría, ya que antes de esta
-- migración no había ningún rastro de "cuántas veces se escaneó
-- cada auditoría").
-- Ambas tablas solo se acceden desde el backend con service_role
-- (ver src/services/costEngine.ts y src/routes/adminCosts.ts), igual
-- que el resto del panel de admin — RLS habilitado sin policies deja
-- la tabla inaccesible para las claves anon/authenticated.
-- ============================================================

create table pricing_config (
    key         text primary key,
    provider    text not null,
    service     text not null,
    unit        text not null,
    unit_price  numeric not null,
    description text,
    updated_at  timestamptz not null default now()
);

alter table pricing_config enable row level security;

insert into pricing_config (key, provider, service, unit, unit_price, description) values
    ('storage_gb',           'supabase', 'storage',  'GB almacenado',        0.021,   'Evidencias y reportes almacenados en Supabase Storage'),
    ('db_row',                'supabase', 'postgres', '1000 filas',           0.02,    'Almacenamiento estimado de filas en audits/findings/profiles/etc.'),
    ('auth_mau',               'supabase', 'auth',     'usuario activo/mes',   0.00325, 'Usuarios activos mensuales (aproximado por miembros de organización)'),
    ('worker_hour',            'redis',    'bullmq',   'hora de CPU',          0.05,    'Cómputo del worker de BullMQ ejecutando escaneos'),
    ('scan_unit',              'scan_engine', 'network', 'escaneo ejecutado',  0.0005,  'Nmap + verificación TLS + cabeceras HTTP por activo escaneado'),
    ('pdf_report',             'pdf_engine', 'reports', 'reporte generado',    0.001,   'Renderizado de PDF de auditoría'),
    ('hosting_compute_hour',   'hosting',  'compute',  'hora de cómputo',      0.02,    'Estimación de cómputo serverless/Node.js del backend'),
    ('hosting_bandwidth_gb',   'hosting',  'bandwidth', 'GB de tráfico',       0.01,    'Estimación de ancho de banda del frontend/API');

create table scan_runs (
    id              uuid primary key default uuid_generate_v4(),
    audit_id        uuid not null references audits(id) on delete cascade,
    assets_scanned  integer not null default 0,
    findings_count  integer not null default 0,
    status          text not null check (status in ('completed', 'failed')),
    started_at      timestamptz not null,
    finished_at     timestamptz not null,
    created_at      timestamptz not null default now()
);
create index idx_scan_runs_audit on scan_runs(audit_id);
create index idx_scan_runs_created on scan_runs(created_at);

alter table scan_runs enable row level security;
