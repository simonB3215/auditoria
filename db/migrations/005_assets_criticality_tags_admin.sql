-- ============================================================
-- Migración 005 — Fase 2: gestión de activos ampliada + admin de plataforma
-- ============================================================

-- Nuevos tipos de activo: repositorio Git y servidor cloud, además de ip/cidr/domain.
alter table assets drop constraint if exists assets_type_check;
alter table assets add constraint assets_type_check
    check (type in ('ip', 'cidr', 'domain', 'repository', 'cloud_server'));

-- Criticidad y etiquetas, para los filtros de la UI de activos.
alter table assets add column criticality text not null default 'media'
    check (criticality in ('critica', 'alta', 'media', 'baja'));
alter table assets add column tags text[] not null default '{}';

create index idx_assets_criticality on assets(criticality);
create index idx_assets_tags on assets using gin(tags);

-- Suspensión de organizaciones (gestión de tenants desde /admin). Un
-- usuario de una organización suspendida no puede seguir usando la API
-- (ver requireActiveOrganization en el middleware de auth).
alter table organizations add column is_suspended boolean not null default false;
