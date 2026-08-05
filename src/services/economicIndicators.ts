import { supabaseAdmin } from "../config/supabase.js";

const MINDICADOR_URL = "https://mindicador.cl/api";

/** Debajo de esta antigüedad, se sirve el valor cacheado sin volver a golpear la API pública. */
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Por encima de esta antigüedad, se lo marca `stale` para que la UI avise que no es el valor del día. */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export interface EconomicIndicators {
  ufValue: number;
  utmValue: number;
  dolarValue: number;
  fetchedAt: string;
  /** true si el último valor guardado tiene más de 24h — Mindicador.cl no respondió en la corrida más reciente (cron o request en vivo). */
  stale: boolean;
}

interface MindicadorResponse {
  uf?: { valor: number };
  utm?: { valor: number };
  dolar?: { valor: number };
}

interface StoredIndicatorRow {
  uf_value: number;
  utm_value: number;
  dolar_value: number;
  fetched_at: string;
}

async function fetchFromMindicador(): Promise<{ uf: number; utm: number; dolar: number } | null> {
  try {
    const res = await fetch(MINDICADOR_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = (await res.json()) as MindicadorResponse;
    if (!json.uf?.valor || !json.utm?.valor || !json.dolar?.valor) return null;
    return { uf: json.uf.valor, utm: json.utm.valor, dolar: json.dolar.valor };
  } catch (err) {
    console.error("[economic-indicators] fetch a Mindicador.cl falló:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function persist(values: { uf: number; utm: number; dolar: number }): Promise<StoredIndicatorRow | null> {
  const { data, error } = await supabaseAdmin
    .from("system_economic_indicators")
    .insert({ uf_value: values.uf, utm_value: values.utm, dolar_value: values.dolar })
    .select("uf_value, utm_value, dolar_value, fetched_at")
    .single();
  if (error) {
    console.error("[economic-indicators] no se pudo guardar el valor obtenido:", error.message);
    return null;
  }
  return data;
}

async function getStoredLatest(): Promise<StoredIndicatorRow | null> {
  const { data } = await supabaseAdmin
    .from("system_economic_indicators")
    .select("uf_value, utm_value, dolar_value, fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

function toIndicators(row: StoredIndicatorRow): EconomicIndicators {
  const stale = Date.now() - new Date(row.fetched_at).getTime() > STALE_THRESHOLD_MS;
  return {
    ufValue: Number(row.uf_value),
    utmValue: Number(row.utm_value),
    dolarValue: Number(row.dolar_value),
    fetchedAt: row.fetched_at,
    stale,
  };
}

/**
 * Llamado por el cron diario (ver economicIndicatorsQueue.ts) y también
 * disponible para forzar un refresco manual. Si Mindicador.cl no responde,
 * no escribe nada — el último registro guardado sigue siendo el fallback
 * vigente para getLatestIndicators().
 */
export async function refreshEconomicIndicators(): Promise<EconomicIndicators | null> {
  const live = await fetchFromMindicador();
  if (!live) return null;
  const saved = await persist(live);
  return saved ? toIndicators(saved) : null;
}

/**
 * Punto de lectura del dashboard. Estrategia de resiliencia (a.md, sección
 * "Caché y Resiliencia"): si el último valor guardado tiene menos de 1h, se
 * sirve directo sin llamar a la API externa; si es más viejo, se intenta un
 * fetch en vivo y solo si ESE falla se cae al último valor guardado
 * (`stale: true`). Solo lanza si la tabla está vacía Y la API está caída —
 * caso límite del primer arranque, antes de la primera corrida del cron.
 */
export async function getLatestIndicators(): Promise<EconomicIndicators> {
  const cached = await getStoredLatest();
  const cacheFresh = cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS;

  if (!cacheFresh) {
    const live = await fetchFromMindicador();
    if (live) {
      const saved = await persist(live);
      if (saved) return toIndicators(saved);
    }
  }

  if (cached) return toIndicators(cached);

  throw new Error(
    "No hay indicadores económicos disponibles: Mindicador.cl no respondió y todavía no hay ningún valor guardado."
  );
}
