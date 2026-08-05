-- ============================================================
-- Se elimina por completo el sistema de invitación por link
-- (invite_links, migración 014): la gestión de organización/rol de
-- usuarios ahora se hace exclusivamente vía asignación directa desde
-- /admin (POST /admin/users/assign-organization y /admin/users/role).
-- La tabla estaba vacía al momento de esta migración — no hay datos que
-- migrar ni preservar.
-- ============================================================

drop table if exists invite_links;
