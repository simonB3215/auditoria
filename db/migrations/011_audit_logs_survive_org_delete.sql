-- ============================================================
-- Un log de auditoría que se borra en cascada cuando se borra la
-- organización deja de ser "inmutable" en la práctica: el caso más
-- importante a preservar (ORGANIZATION_DELETED) desaparecería junto con
-- el resto del historial en el mismo instante en que se escribe. Se
-- corrige la FK de `on delete cascade` (heredado del resto del esquema)
-- a `on delete set null`, para que el historial sobreviva al borrado de
-- la organización que lo generó.
-- ============================================================

alter table audit_logs alter column organization_id drop not null;
alter table audit_logs drop constraint audit_logs_organization_id_fkey;
alter table audit_logs add constraint audit_logs_organization_id_fkey
    foreign key (organization_id) references organizations(id) on delete set null;
