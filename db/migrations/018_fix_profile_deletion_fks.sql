-- ============================================================
-- Corrige el error real reportado: borrar una organización (que en
-- cascada borra sus `profiles`, ver `profiles.organization_id ... on
-- delete cascade`) fallaba con
--   "update or delete on table profiles violates foreign key constraint
--    audit_evidences_uploaded_by_fkey on table audit_evidences"
-- porque `audit_evidences.uploaded_by → profiles(id)` (y otras columnas
-- equivalentes) nunca declararon ON DELETE, así que Postgres usa NO ACTION
-- por defecto y bloquea el borrado del perfil referenciado — aunque la
-- propia fila de audit_evidences también vaya a desaparecer en la misma
-- cascada (vía audit_id → audits → organization_id), Postgres no garantiza
-- el orden entre ramas hermanas de una cascada, así que el bloqueo es
-- real e intermitente, no cosmético.
--
-- Se aplica el mismo criterio a las demás columnas que referencian
-- profiles(id) sin ON DELETE (assets.created_by, audits.created_by,
-- reports.generated_by, findings.reviewed_by): se preserva la fila
-- histórica (evidencia, activo, auditoría, reporte, hallazgo — necesario
-- para la trazabilidad de la Ley 21.663) pero el puntero al usuario queda
-- en NULL si el perfil se borra. `audit_logs.actor_id` ya usaba
-- `on delete set null` desde su creación (migración 009) — no requiere
-- cambios.
--
-- a.md pedía revisar también `organization_members` y `scan_runs`:
-- `organization_members` no existe en este esquema (cada perfil pertenece
-- a una sola organización vía `profiles.organization_id`, no hay tabla de
-- unión — ver migración 013 y `src/routes/admin.ts`) y `scan_runs` no
-- tiene ninguna columna que referencie `profiles` (no hay nada que
-- corregir en ninguna de las dos).
-- ============================================================

alter table audit_evidences alter column uploaded_by drop not null;
alter table audit_evidences drop constraint audit_evidences_uploaded_by_fkey;
alter table audit_evidences
    add constraint audit_evidences_uploaded_by_fkey
    foreign key (uploaded_by) references profiles(id)
    on delete set null on update cascade;

alter table assets alter column created_by drop not null;
alter table assets drop constraint assets_created_by_fkey;
alter table assets
    add constraint assets_created_by_fkey
    foreign key (created_by) references profiles(id)
    on delete set null on update cascade;

alter table audits alter column created_by drop not null;
alter table audits drop constraint audits_created_by_fkey;
alter table audits
    add constraint audits_created_by_fkey
    foreign key (created_by) references profiles(id)
    on delete set null on update cascade;

alter table reports alter column generated_by drop not null;
alter table reports drop constraint reports_generated_by_fkey;
alter table reports
    add constraint reports_generated_by_fkey
    foreign key (generated_by) references profiles(id)
    on delete set null on update cascade;

-- findings.reviewed_by ya era nullable (migración 010); solo le faltaba el ON DELETE.
alter table findings drop constraint findings_reviewed_by_fkey;
alter table findings
    add constraint findings_reviewed_by_fkey
    foreign key (reviewed_by) references profiles(id)
    on delete set null on update cascade;
