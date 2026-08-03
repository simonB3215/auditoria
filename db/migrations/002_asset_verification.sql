-- ============================================================
-- Migración 002 — Verificación de propiedad de activos
--
-- Motivo: la Fase 3 introduce un motor de escaneo activo (Nmap) contra
-- IPs/dominios. Escanear un activo sin confirmar que el usuario/organización
-- es su dueño equivale a un escaneo no autorizado contra un tercero
-- (ver vacío de seguridad #1 en arquitectura-mvp.md). Esta migración agrega
-- el estado mínimo necesario para bloquear el escaneo hasta que el activo
-- esté verificado.
-- ============================================================

alter table assets
    add column verification_status text not null default 'pending'
        check (verification_status in ('pending', 'verified')),
    add column verification_token text not null default encode(gen_random_bytes(16), 'hex'),
    add column verified_at timestamptz;

create index idx_assets_verification on assets(verification_status);
