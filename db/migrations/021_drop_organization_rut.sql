-- ============================================================
-- Limpieza de campo fantasma (a.md, "AUDITORÍA Y LIMPIEZA DE
-- INCONSISTENCIAS EN MODELO DE DATOS, UI Y FORMULARIOS"): `rut` se agregó
-- en la migración 019 pero ningún formulario de la plataforma lo captura
-- (el onboarding de organización solo pide nombre) — quedaba `null` para
-- toda organización nueva y solo generaba una columna/fallback "Sin RUT"
-- sin valor real en /admin/organizations y el buscador global. Se elimina
-- por completo en vez de dejarla nullable-sin-usar: no hay ningún dato
-- real cargado ahí que preservar.
-- ============================================================

alter table organizations drop column rut;
