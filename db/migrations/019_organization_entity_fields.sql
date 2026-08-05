-- ============================================================
-- Rediseño de /admin (a.md: "REDISEÑO Y RESTRUCTURACIÓN COMPLETA DEL
-- DASHBOARD DE ADMINISTRACIÓN"): las organizaciones pasan a modelarse como
-- entidades de empresa puras (sin listar usuarios en la misma vista), con
-- campos propios de identidad corporativa y plan.
--
-- `plan` es una ETIQUETA administrativa, no una suscripción real: no hay
-- pasarela de pagos conectada (ver README, "Limitaciones conocidas" y
-- DASHBOARD_FINOPS_INTERNO.md) — es lo mismo que ya pasa con `is_suspended`,
-- un campo real y persistido que el platform admin controla a mano, sin
-- pretender que hay facturación real detrás. `rut` (identificador
-- tributario chileno) es texto libre nullable: no se valida formato/dígito
-- verificador acá, es solo un dato de identidad de la empresa.
-- ============================================================

alter table organizations add column rut text;
alter table organizations add column plan text not null default 'starter' check (plan in ('starter', 'pro', 'custom'));
