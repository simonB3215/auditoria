-- ============================================================
-- Tasa de cambio USD -> CLP para mostrar el panel de FinOps
-- (/admin/costs) en pesos chilenos. Las tarifas de los proveedores
-- siguen denominadas en USD (así facturan realmente); esta fila solo
-- convierte el total a CLP al momento de mostrarlo. Editable desde el
-- mismo modal de tarifas — hay que actualizarla cuando cambie el
-- tipo de cambio real.
-- ============================================================

insert into pricing_config (key, provider, service, unit, unit_price, description) values
    ('fx_usd_clp', 'fx', 'exchange_rate', 'CLP por 1 USD', 950, 'Tipo de cambio usado para mostrar los costos en pesos chilenos');
