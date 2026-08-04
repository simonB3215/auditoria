-- ============================================================
-- Rol "Piloto Invitado (10 días)": agrega el valor al enum en su propia
-- migración, aislado de cualquier otra sentencia. Postgres no permite usar
-- un valor de enum recién agregado (en comparaciones, RLS, etc.) dentro de
-- la MISMA transacción en que se agregó — por eso esto va solo en este
-- archivo, y todo lo que lo usa (columnas, policies) va en la siguiente
-- migración.
-- ============================================================

alter type user_role add value 'auditor_guest';
