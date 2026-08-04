-- ============================================================
-- "Crédito" como unidad interna de facturación de la plataforma,
-- mostrada junto a los pesos chilenos en el panel FinOps (/admin/costs).
-- El valor en CLP de 1 crédito es una decisión de producto (no un dato
-- de mercado como el tipo de cambio) — editable desde el mismo modal
-- de tarifas.
-- ============================================================

insert into pricing_config (key, provider, service, unit, unit_price, description) values
    ('credit_value_clp', 'credits', 'platform', 'CLP por 1 crédito', 100, 'Valor en pesos chilenos de 1 crédito de la plataforma');
