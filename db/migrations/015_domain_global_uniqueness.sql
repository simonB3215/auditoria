-- ============================================================
-- Verificación de propiedad de dominio — unicidad global.
--
-- La restricción existente `unique(organization_id, type, value)` permite
-- que DOS organizaciones distintas registren (y "verifiquen") el mismo
-- dominio de forma independiente. Eso rompe la premisa de "verificación de
-- propiedad": si dos orgs pueden reclamarlo, no está probando titularidad
-- exclusiva de nada. a.md pide unicidad global para `organization_domains`
-- — acá se logra con un índice único parcial sobre `assets.value` (case
-- insensitive) filtrado a `type = 'domain'`, sin crear una tabla paralela
-- que duplicaría el estado de verificación que ya vive en `assets`.
-- ============================================================

create unique index idx_assets_domain_global_unique on assets (lower(value)) where type = 'domain';
