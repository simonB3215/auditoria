-- ============================================================
-- Retención/purga de evidencias (GDPR) + justificación de estado de
-- hallazgos (gestión de falsos positivos / riesgo aceptado).
-- ============================================================

-- NULL = sin política de retención configurada (nunca se purga automático).
alter table organizations add column retention_period_days integer;

-- El binario se borra de Storage; la fila y su metadata quedan (registro
-- legal de que existió y quién lo subió), storage_path se conserva como
-- referencia histórica de dónde estaba, pero is_purged=true indica que ya
-- no hay nada que leer en esa ruta.
alter table audit_evidences add column is_purged boolean not null default false;
alter table audit_evidences add column purged_at timestamptz;

-- Justificación obligatoria + auditor responsable al marcar un hallazgo
-- como false_positive o accepted_risk (el enum finding_status ya soporta
-- ambos valores desde el esquema inicial).
alter table findings add column justification_notes text;
alter table findings add column reviewed_by uuid references profiles(id);
