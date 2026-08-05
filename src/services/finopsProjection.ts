/**
 * Motor de simulación financiera interna (a.md: "ECUACIONES DEL MOTOR
 * FINANCIERO INTERNO"). Funciones puras — no tocan la base de datos, para
 * poder recalcular en cada request de forma barata cuando el usuario mueve
 * un slider.
 */

export const SII_LEY_21663_ADDRESSABLE_COMPANIES = 10_000;

export interface ProjectionInputs {
  startersCount: number;
  proCount: number;
  starterPriceUf: number;
  proPriceUf: number;
  costVarUsdPerClient: number;
  opexUsd: number;
  marketPenetrationPct: number;
}

export const DEFAULT_PROJECTION_INPUTS: ProjectionInputs = {
  startersCount: 20,
  proCount: 5,
  starterPriceUf: 1.5,
  proPriceUf: 4.5,
  costVarUsdPerClient: 0.25,
  opexUsd: 40,
  marketPenetrationPct: 1,
};

export interface MonthlyProjectionPoint {
  month: number;
  revenueClp: number;
  costsClp: number;
  netProfitClp: number;
}

export interface ProjectionResult {
  totalClients: number;
  mrrClp: number;
  mrrUf: number;
  arrClp: number;
  cogsClp: number;
  opexClp: number;
  netProfitClp: number;
  netMarginPct: number;
  /** null si el margen de contribución por cliente es cero o negativo (no hay combinación de precio/costo que llegue a cubrir OPEX). */
  breakEvenClients: number | null;
  addressableClients: number;
  monthlyProjection: MonthlyProjectionPoint[];
}

/**
 * Punto de equilibrio: cuántos clientes (con la mezcla Starter/Pro actual)
 * hacen falta para que el margen de contribución total cubra el OPEX fijo.
 * Usa el margen de contribución PROMEDIO de la mezcla vigente — si no hay
 * ningún cliente cargado todavía, usa el margen de un cliente Starter como
 * piso conservador (el plan más barato).
 */
function computeBreakEven(
  inputs: ProjectionInputs,
  ufValue: number,
  dolarValue: number,
  opexClp: number
): number | null {
  const costVarClpPerClient = inputs.costVarUsdPerClient * dolarValue;
  const totalClients = inputs.startersCount + inputs.proCount;

  let avgContributionPerClient: number;
  if (totalClients > 0) {
    const revenueClp = (inputs.startersCount * inputs.starterPriceUf + inputs.proCount * inputs.proPriceUf) * ufValue;
    avgContributionPerClient = revenueClp / totalClients - costVarClpPerClient;
  } else {
    avgContributionPerClient = inputs.starterPriceUf * ufValue - costVarClpPerClient;
  }

  if (avgContributionPerClient <= 0) return null;
  return Math.ceil(opexClp / avgContributionPerClient);
}

/**
 * Proyección acumulada a 12 meses. Simplificación deliberada: asume un
 * run-rate constante (sin curva de crecimiento ni churn, que a.md no
 * especifica) — mes N = MRR/COGS/OPEX del escenario actual × N. Sirve para
 * visualizar el punto de equilibrio en el tiempo dado el escenario
 * simulado, no como pronóstico de crecimiento.
 */
function computeMonthlyProjection(mrrClp: number, cogsClp: number, opexClp: number): MonthlyProjectionPoint[] {
  const points: MonthlyProjectionPoint[] = [];
  for (let month = 1; month <= 12; month++) {
    const revenueClp = mrrClp * month;
    const costsClp = (cogsClp + opexClp) * month;
    points.push({ month, revenueClp, costsClp, netProfitClp: revenueClp - costsClp });
  }
  return points;
}

export function computeProjection(inputs: ProjectionInputs, ufValue: number, dolarValue: number): ProjectionResult {
  const totalClients = inputs.startersCount + inputs.proCount;

  const mrrUf = inputs.startersCount * inputs.starterPriceUf + inputs.proCount * inputs.proPriceUf;
  const mrrClp = mrrUf * ufValue;
  const arrClp = mrrClp * 12;

  const cogsClp = totalClients * (inputs.costVarUsdPerClient * dolarValue);
  const opexClp = inputs.opexUsd * dolarValue;

  const netProfitClp = mrrClp - (opexClp + cogsClp);
  const netMarginPct = mrrClp > 0 ? (netProfitClp / mrrClp) * 100 : 0;

  const breakEvenClients = computeBreakEven(inputs, ufValue, dolarValue, opexClp);
  const addressableClients = Math.round(
    SII_LEY_21663_ADDRESSABLE_COMPANIES * (inputs.marketPenetrationPct / 100)
  );

  return {
    totalClients,
    mrrClp,
    mrrUf,
    arrClp,
    cogsClp,
    opexClp,
    netProfitClp,
    netMarginPct,
    breakEvenClients,
    addressableClients,
    monthlyProjection: computeMonthlyProjection(mrrClp, cogsClp, opexClp),
  };
}
