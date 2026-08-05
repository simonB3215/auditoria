-- ============================================================
-- Indicadores económicos oficiales (UF/UTM/Dólar) — Dashboard FinOps
-- interno (a.md: "DASHBOARD FINANCIERO INTERNO Y FINOPS CON APIS EN
-- TIEMPO REAL"). Se cachean acá los valores de mindicador.cl para poder
-- servir el panel aunque la API pública esté caída (ver
-- src/services/economicIndicators.ts) y para que el cron diario tenga
-- dónde dejar su corrida.
--
-- Sin políticas para `authenticated`/`anon` — mismo patrón que scan_runs
-- (006), invite_links (014) y audit_logs (009): el frontend nunca consulta
-- esta tabla directo, siempre a través de GET /admin/internal-finops/*
-- (requirePlatformAdmin), así que solo service_role necesita acceso.
-- ============================================================

create table system_economic_indicators (
    id          uuid primary key default uuid_generate_v4(),
    uf_value    numeric not null,
    utm_value   numeric not null,
    dolar_value numeric not null,
    fetched_at  timestamptz not null default now()
);
create index idx_economic_indicators_fetched_at on system_economic_indicators(fetched_at desc);

alter table system_economic_indicators enable row level security;
