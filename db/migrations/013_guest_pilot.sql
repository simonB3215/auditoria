-- ============================================================
-- Rol "Piloto Invitado (10 días)" — parte 2.
--
-- a.md pide una tabla `organization_members` con `expires_at`. Este
-- proyecto no tiene esa tabla: `profiles` YA ES la fila de membresía
-- (1 fila = 1 usuario = 1 organización, ver Fase 1). Agregar una tabla
-- `organization_members` paralela crearía dos fuentes de verdad para lo
-- mismo — en cambio, se agrega `expires_at` directo en `profiles`, que es
-- de donde `current_organization_id()`/`current_user_role()` ya leen.
--
-- `expires_at` es NULL para cualquier usuario que no sea un guest; se
-- completa recién al aceptar la invitación (no al enviarla), para que una
-- invitación sin usar no le "queme" días de prueba a nadie.
-- ============================================================

alter table profiles add column expires_at timestamptz;

create or replace function current_profile_expires_at()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
    select expires_at from profiles where id = auth.uid();
$$;

-- ============================================================
-- RLS: un auditor_guest escribe igual que un auditor, pero solo mientras
-- no haya expirado. Se re-declaran las policies de escritura existentes
-- (no hay "ALTER POLICY ... expression", hay que drop + create) agregando
-- esta guarda. Después de expirar, la degradación autónoma a 'viewer'
-- (ver authenticateToken en el backend) hace que current_user_role() ya
-- ni siquiera devuelva 'auditor_guest' — esta guarda es la red de
-- seguridad para la ventana entre que expira y que corre esa degradación.
-- ============================================================

drop policy assets_insert on assets;
create policy assets_insert on assets
    for insert with check (
        organization_id = current_organization_id() and created_by = auth.uid()
        and (current_user_role() <> 'auditor_guest' or current_profile_expires_at() > now())
    );

drop policy assets_modify on assets;
create policy assets_modify on assets
    for update using (
        organization_id = current_organization_id() and (created_by = auth.uid() or current_user_role() = 'ciso')
        and (current_user_role() <> 'auditor_guest' or current_profile_expires_at() > now())
    );

drop policy audits_insert on audits;
create policy audits_insert on audits
    for insert with check (
        organization_id = current_organization_id() and created_by = auth.uid()
        and (current_user_role() <> 'auditor_guest' or current_profile_expires_at() > now())
    );

drop policy audits_modify on audits;
create policy audits_modify on audits
    for update using (
        organization_id = current_organization_id() and (created_by = auth.uid() or current_user_role() = 'ciso')
        and (current_user_role() <> 'auditor_guest' or current_profile_expires_at() > now())
    );

drop policy audit_assets_insert on audit_assets;
create policy audit_assets_insert on audit_assets
    for insert with check (
        audit_id in (select id from audits where organization_id = current_organization_id())
        and (current_user_role() <> 'auditor_guest' or current_profile_expires_at() > now())
    );

drop policy evidences_insert on audit_evidences;
create policy evidences_insert on audit_evidences
    for insert with check (
        uploaded_by = auth.uid()
        and audit_id in (select id from audits where organization_id = current_organization_id())
        and (current_user_role() <> 'auditor_guest' or current_profile_expires_at() > now())
    );

drop policy findings_modify on findings;
create policy findings_modify on findings
    for update using (
        audit_id in (select id from audits where organization_id = current_organization_id())
        and current_user_role() in ('ciso', 'auditor', 'auditor_guest')
        and (current_user_role() <> 'auditor_guest' or current_profile_expires_at() > now())
    );
