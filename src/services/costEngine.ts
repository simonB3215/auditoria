import { supabaseAdmin } from "../config/supabase.js";

/**
 * Motor de estimación de costos FinOps. No existe una integración real con
 * las APIs de facturación de Supabase/Upstash/el proveedor de hosting (eso
 * requeriría tokens de Management API distintos al service_role que usa
 * este backend) — en cambio, se estima el gasto a partir de las señales de
 * uso que el propio sistema ya registra (bytes de evidencias, reportes
 * generados, ejecuciones de escaneo, filas por tabla, miembros por
 * organización) multiplicadas por tarifas unitarias editables. `hosting` es
 * la única categoría sin una señal de uso directa: se modela como un costo
 * fijo mensual estimado, prorrateado entre organizaciones según su
 * participación en la actividad total (storage + escaneos + reportes).
 */

export const COST_CATEGORY_KEYS = [
  "supabase_db",
  "supabase_storage",
  "redis_workers",
  "scan_engine",
  "pdf_engine",
  "hosting",
] as const;
export type CostCategoryKey = (typeof COST_CATEGORY_KEYS)[number];

export interface PricingConfig {
  db_row: number;
  auth_mau: number;
  storage_gb: number;
  worker_hour: number;
  scan_unit: number;
  pdf_report: number;
  hosting_compute_hour: number;
  hosting_bandwidth_gb: number;
  fx_usd_clp: number;
  credit_value_clp: number;
}

export const DEFAULT_PRICING: PricingConfig = {
  db_row: 0.02,
  auth_mau: 0.00325,
  storage_gb: 0.021,
  worker_hour: 0.05,
  scan_unit: 0.0005,
  pdf_report: 0.001,
  hosting_compute_hour: 0.02,
  hosting_bandwidth_gb: 0.01,
  // Tarifas de los proveedores (arriba) se facturan en USD real; esta tasa
  // convierte el total a CLP solo para mostrarlo en el panel. Es editable
  // desde el mismo modal de tarifas — hay que actualizarla cuando cambie el
  // tipo de cambio.
  fx_usd_clp: 950,
  // "Crédito" es la unidad interna de facturación de la plataforma; este
  // valor define cuántos CLP vale 1 crédito. También editable desde el
  // modal de tarifas — es una decisión de producto, no un dato de mercado.
  credit_value_clp: 100,
};

function toClp(usd: number, pricing: PricingConfig): number {
  return usd * pricing.fx_usd_clp;
}

function toCredits(clp: number, pricing: PricingConfig): number {
  return clp / pricing.credit_value_clp;
}

// Supuesto de dimensionamiento fijo para el estimado de hosting, ya que no
// hay una métrica real de horas de cómputo/ancho de banda del proveedor.
const ASSUMED_MONTHLY_COMPUTE_HOURS = 730; // 24/7 durante ~1 mes
const ASSUMED_MONTHLY_BANDWIDTH_GB = 50;

export interface PricingConfigRow {
  key: keyof PricingConfig;
  provider: string;
  service: string;
  unit: string;
  unit_price: number;
  description: string | null;
  updated_at: string;
}

export async function listPricingConfig(): Promise<PricingConfigRow[]> {
  const { data, error } = await supabaseAdmin
    .from("pricing_config")
    .select("key, provider, service, unit, unit_price, description, updated_at")
    .order("provider", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PricingConfigRow[];
}

export async function updatePricing(updates: { key: string; unit_price: number }[]): Promise<void> {
  for (const update of updates) {
    const { error } = await supabaseAdmin
      .from("pricing_config")
      .update({ unit_price: update.unit_price, updated_at: new Date().toISOString() })
      .eq("key", update.key);
    if (error) throw new Error(error.message);
  }
}

async function loadPricing(): Promise<PricingConfig> {
  const { data } = await supabaseAdmin.from("pricing_config").select("key, unit_price");
  const pricing = { ...DEFAULT_PRICING };
  for (const row of data ?? []) {
    if (row.key in pricing) {
      (pricing as Record<string, number>)[row.key] = Number(row.unit_price);
    }
  }
  return pricing;
}

interface AuditUsage {
  auditId: string;
  auditTitle: string;
  organizationId: string;
  organizationName: string;
  createdAt: string;
  storageBytes: number;
  scansExecuted: number;
  workerSeconds: number;
  reportsGenerated: number;
  rowCount: number;
}

interface OrgUsage {
  organizationId: string;
  organizationName: string;
  memberCount: number;
  auditIds: string[];
}

interface RawUsageSnapshot {
  auditUsage: Map<string, AuditUsage>;
  orgUsage: Map<string, OrgUsage>;
  dailyRows: { date: string; storageBytes: number; scansExecuted: number; workerSeconds: number; reportsGenerated: number; dbRows: number }[];
}

/**
 * Junta todas las señales de uso crudo (sin aplicar tarifas todavía) desde
 * las tablas que ya existían más `scan_runs` (agregada en esta misma
 * entrega). `fromDate`/`toDate` filtran las señales con marca de tiempo
 * propia (evidencias, reportes, scan_runs); las auditorías y organizaciones
 * en sí no se filtran para no perder el contexto (nombre/org) de una
 * actividad que sí cae dentro del rango.
 */
async function gatherRawUsage(fromDate?: Date, toDate?: Date): Promise<RawUsageSnapshot> {
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime();
    if (fromDate && t < fromDate.getTime()) return false;
    if (toDate && t > toDate.getTime()) return false;
    return true;
  };

  const [
    { data: organizations },
    { data: profiles },
    { data: audits },
    { data: evidences },
    { data: reports },
    { data: findings },
    { data: scanRuns },
  ] = await Promise.all([
    supabaseAdmin.from("organizations").select("id, name"),
    supabaseAdmin.from("profiles").select("id, organization_id"),
    supabaseAdmin.from("audits").select("id, organization_id, title, created_at"),
    supabaseAdmin.from("audit_evidences").select("audit_id, size_bytes, created_at"),
    supabaseAdmin.from("reports").select("id, audit_id, generated_at"),
    supabaseAdmin.from("findings").select("id, audit_id"),
    supabaseAdmin.from("scan_runs").select("audit_id, assets_scanned, started_at, finished_at, created_at"),
  ]);

  const orgNameById = new Map((organizations ?? []).map((o) => [o.id, o.name] as const));
  const orgUsage = new Map<string, OrgUsage>();
  for (const org of organizations ?? []) {
    orgUsage.set(org.id, { organizationId: org.id, organizationName: org.name, memberCount: 0, auditIds: [] });
  }
  for (const p of profiles ?? []) {
    const org = orgUsage.get(p.organization_id);
    if (org) org.memberCount += 1;
  }

  const auditUsage = new Map<string, AuditUsage>();
  for (const audit of audits ?? []) {
    const org = orgUsage.get(audit.organization_id);
    auditUsage.set(audit.id, {
      auditId: audit.id,
      auditTitle: audit.title,
      organizationId: audit.organization_id,
      organizationName: org?.organizationName ?? orgNameById.get(audit.organization_id) ?? "—",
      createdAt: audit.created_at,
      storageBytes: 0,
      scansExecuted: 0,
      workerSeconds: 0,
      reportsGenerated: 0,
      rowCount: 1, // la propia fila de `audits`
    });
    org?.auditIds.push(audit.id);
  }

  const dailyMap = new Map<string, { storageBytes: number; scansExecuted: number; workerSeconds: number; reportsGenerated: number; dbRows: number }>();
  const bumpDaily = (iso: string, patch: Partial<{ storageBytes: number; scansExecuted: number; workerSeconds: number; reportsGenerated: number; dbRows: number }>) => {
    const date = iso.slice(0, 10);
    const entry = dailyMap.get(date) ?? { storageBytes: 0, scansExecuted: 0, workerSeconds: 0, reportsGenerated: 0, dbRows: 0 };
    for (const [k, v] of Object.entries(patch)) {
      (entry as Record<string, number>)[k] += v as number;
    }
    dailyMap.set(date, entry);
  };

  for (const ev of evidences ?? []) {
    const usage = auditUsage.get(ev.audit_id);
    if (usage) {
      usage.storageBytes += ev.size_bytes ?? 0;
      usage.rowCount += 1;
    }
    if (inRange(ev.created_at)) bumpDaily(ev.created_at, { storageBytes: ev.size_bytes ?? 0, dbRows: 1 });
  }

  for (const report of reports ?? []) {
    const usage = auditUsage.get(report.audit_id);
    if (usage) {
      usage.reportsGenerated += 1;
      usage.rowCount += 1;
    }
    if (inRange(report.generated_at)) bumpDaily(report.generated_at, { reportsGenerated: 1, dbRows: 1 });
  }

  for (const finding of findings ?? []) {
    const usage = auditUsage.get(finding.audit_id);
    if (usage) usage.rowCount += 1;
  }

  for (const run of scanRuns ?? []) {
    const usage = auditUsage.get(run.audit_id);
    const seconds = Math.max(0, (new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000);
    if (usage) {
      usage.scansExecuted += run.assets_scanned ?? 0;
      usage.workerSeconds += seconds;
      usage.rowCount += 1;
    }
    if (inRange(run.created_at)) {
      bumpDaily(run.created_at, { scansExecuted: run.assets_scanned ?? 0, workerSeconds: seconds, dbRows: 1 });
    }
  }

  const dailyRows = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  return { auditUsage, orgUsage, dailyRows };
}

function costFromUnits(units: { storageGb: number; scansExecuted: number; workerHours: number; reportsGenerated: number; dbRowsThousands: number; mau: number }, pricing: PricingConfig) {
  return {
    supabase_db: units.dbRowsThousands * pricing.db_row + units.mau * pricing.auth_mau,
    supabase_storage: units.storageGb * pricing.storage_gb,
    redis_workers: units.workerHours * pricing.worker_hour,
    scan_engine: units.scansExecuted * pricing.scan_unit,
    pdf_engine: units.reportsGenerated * pricing.pdf_report,
  };
}

function sumCategories(c: Record<string, number>): number {
  return Object.values(c).reduce((a, b) => a + b, 0);
}

export interface PlatformCostSummary {
  totalMonthlyCostClp: number;
  totalMonthlyCostCredits: number;
  averageCostPerAuditClp: number;
  averageCostPerAuditCredits: number;
  topSpendingOrg: { id: string; name: string; costClp: number; costCredits: number } | null;
  byService: { key: CostCategoryKey; costClp: number; costCredits: number; percentage: number }[];
  totals: { storageGb: number; scansExecuted: number; reportsGenerated: number; workerHours: number; mau: number };
}

export async function getPlatformCostSummary(): Promise<PlatformCostSummary> {
  const pricing = await loadPricing();
  const { auditUsage, orgUsage } = await gatherRawUsage();

  const totals = { storageGb: 0, scansExecuted: 0, reportsGenerated: 0, workerHours: 0, mau: 0 };
  const platformCategories: Record<CostCategoryKey, number> = {
    supabase_db: 0,
    supabase_storage: 0,
    redis_workers: 0,
    scan_engine: 0,
    pdf_engine: 0,
    hosting: 0,
  };

  const costByOrg = new Map<string, number>();

  for (const org of orgUsage.values()) {
    let orgNonHosting = 0;
    for (const auditId of org.auditIds) {
      const usage = auditUsage.get(auditId);
      if (!usage) continue;
      const storageGb = usage.storageBytes / 1_000_000_000;
      const workerHours = usage.workerSeconds / 3600;
      const c = costFromUnits(
        { storageGb, scansExecuted: usage.scansExecuted, workerHours, reportsGenerated: usage.reportsGenerated, dbRowsThousands: usage.rowCount / 1000, mau: 0 },
        pricing
      );
      totals.storageGb += storageGb;
      totals.scansExecuted += usage.scansExecuted;
      totals.reportsGenerated += usage.reportsGenerated;
      totals.workerHours += workerHours;
      orgNonHosting += sumCategories(c);
      for (const key of Object.keys(c) as (keyof typeof c)[]) {
        platformCategories[key] += c[key];
      }
    }
    const mauCost = org.memberCount * pricing.auth_mau;
    totals.mau += org.memberCount;
    platformCategories.supabase_db += mauCost;
    orgNonHosting += mauCost;
    costByOrg.set(org.organizationId, orgNonHosting);
  }

  const hostingBudget =
    ASSUMED_MONTHLY_COMPUTE_HOURS * pricing.hosting_compute_hour + ASSUMED_MONTHLY_BANDWIDTH_GB * pricing.hosting_bandwidth_gb;
  platformCategories.hosting = hostingBudget;

  const totalNonHosting = [...costByOrg.values()].reduce((a, b) => a + b, 0);
  if (totalNonHosting > 0) {
    for (const [orgId, cost] of costByOrg) {
      const share = cost / totalNonHosting;
      costByOrg.set(orgId, cost + share * hostingBudget);
    }
  }

  const totalMonthlyCostUsd = sumCategories(platformCategories);
  const auditCount = auditUsage.size;

  let topSpendingOrgUsd: { id: string; name: string; costUsd: number } | null = null;
  for (const [orgId, cost] of costByOrg) {
    if (!topSpendingOrgUsd || cost > topSpendingOrgUsd.costUsd) {
      const org = orgUsage.get(orgId);
      topSpendingOrgUsd = { id: orgId, name: org?.organizationName ?? "—", costUsd: cost };
    }
  }

  const byService = COST_CATEGORY_KEYS.map((key) => {
    const costClp = toClp(platformCategories[key], pricing);
    return {
      key,
      costClp,
      costCredits: toCredits(costClp, pricing),
      percentage: totalMonthlyCostUsd > 0 ? (platformCategories[key] / totalMonthlyCostUsd) * 100 : 0,
    };
  });

  const totalMonthlyCostClp = toClp(totalMonthlyCostUsd, pricing);
  const averageCostPerAuditClp = auditCount > 0 ? toClp(totalMonthlyCostUsd / auditCount, pricing) : 0;

  return {
    totalMonthlyCostClp,
    totalMonthlyCostCredits: toCredits(totalMonthlyCostClp, pricing),
    averageCostPerAuditClp,
    averageCostPerAuditCredits: toCredits(averageCostPerAuditClp, pricing),
    topSpendingOrg: topSpendingOrgUsd
      ? (() => {
          const costClp = toClp(topSpendingOrgUsd.costUsd, pricing);
          return { id: topSpendingOrgUsd.id, name: topSpendingOrgUsd.name, costClp, costCredits: toCredits(costClp, pricing) };
        })()
      : null,
    byService,
    totals,
  };
}

export interface DailyCostPoint {
  date: string;
  supabase_db: number;
  supabase_storage: number;
  redis_workers: number;
  scan_engine: number;
  pdf_engine: number;
  hosting: number;
  total: number;
  totalCredits: number;
}

export interface OrgCostBreakdown {
  organizationId: string;
  organizationName: string;
  costClp: number;
  costCredits: number;
  auditCount: number;
}

export interface CostBreakdown {
  series: DailyCostPoint[];
  byOrg: OrgCostBreakdown[];
}

export async function getCostBreakdown(fromDate?: Date, toDate?: Date): Promise<CostBreakdown> {
  const pricing = await loadPricing();
  const { dailyRows, orgUsage, auditUsage } = await gatherRawUsage(fromDate, toDate);

  // Costo fijo de hosting distribuido en partes iguales entre los días del
  // rango consultado (no depende de actividad puntual, es un costo base).
  const hostingBudget =
    ASSUMED_MONTHLY_COMPUTE_HOURS * pricing.hosting_compute_hour + ASSUMED_MONTHLY_BANDWIDTH_GB * pricing.hosting_bandwidth_gb;
  const hostingPerDay = dailyRows.length > 0 ? hostingBudget / 30 : 0;

  const series: DailyCostPoint[] = dailyRows.map((row) => {
    const c = costFromUnits(
      {
        storageGb: row.storageBytes / 1_000_000_000,
        scansExecuted: row.scansExecuted,
        workerHours: row.workerSeconds / 3600,
        reportsGenerated: row.reportsGenerated,
        dbRowsThousands: row.dbRows / 1000,
        mau: 0,
      },
      pricing
    );
    const hosting = toClp(hostingPerDay, pricing);
    const clp = {
      supabase_db: toClp(c.supabase_db, pricing),
      supabase_storage: toClp(c.supabase_storage, pricing),
      redis_workers: toClp(c.redis_workers, pricing),
      scan_engine: toClp(c.scan_engine, pricing),
      pdf_engine: toClp(c.pdf_engine, pricing),
    };
    const total = sumCategories(clp) + hosting;
    return { date: row.date, ...clp, hosting, total, totalCredits: toCredits(total, pricing) };
  });

  const byOrg: OrgCostBreakdown[] = [];
  for (const org of orgUsage.values()) {
    let cost = org.memberCount * pricing.auth_mau;
    let auditCount = 0;
    for (const auditId of org.auditIds) {
      const usage = auditUsage.get(auditId);
      if (!usage) continue;
      if (fromDate && new Date(usage.createdAt) < fromDate) continue;
      if (toDate && new Date(usage.createdAt) > toDate) continue;
      auditCount += 1;
      const c = costFromUnits(
        {
          storageGb: usage.storageBytes / 1_000_000_000,
          scansExecuted: usage.scansExecuted,
          workerHours: usage.workerSeconds / 3600,
          reportsGenerated: usage.reportsGenerated,
          dbRowsThousands: usage.rowCount / 1000,
          mau: 0,
        },
        pricing
      );
      cost += sumCategories(c);
    }
    const costClp = toClp(cost, pricing);
    byOrg.push({
      organizationId: org.organizationId,
      organizationName: org.organizationName,
      costClp,
      costCredits: toCredits(costClp, pricing),
      auditCount,
    });
  }
  byOrg.sort((a, b) => b.costClp - a.costClp);

  return { series, byOrg };
}

export interface AuditCostRow {
  auditId: string;
  auditTitle: string;
  organizationId: string;
  organizationName: string;
  storageMb: number;
  scansExecuted: number;
  reportsGenerated: number;
  dbCostClp: number;
  totalCostClp: number;
  totalCostCredits: number;
  breakdown: Record<CostCategoryKey, number>;
}

export async function getAuditCosts(limit: number, fromDate?: Date, toDate?: Date): Promise<AuditCostRow[]> {
  const pricing = await loadPricing();
  const { auditUsage } = await gatherRawUsage(fromDate, toDate);

  const rows: AuditCostRow[] = [];
  for (const usage of auditUsage.values()) {
    if (fromDate && new Date(usage.createdAt) < fromDate) continue;
    if (toDate && new Date(usage.createdAt) > toDate) continue;

    const c = costFromUnits(
      {
        storageGb: usage.storageBytes / 1_000_000_000,
        scansExecuted: usage.scansExecuted,
        workerHours: usage.workerSeconds / 3600,
        reportsGenerated: usage.reportsGenerated,
        dbRowsThousands: usage.rowCount / 1000,
        mau: 0,
      },
      pricing
    );
    const breakdown: Record<CostCategoryKey, number> = {
      supabase_db: toClp(c.supabase_db, pricing),
      supabase_storage: toClp(c.supabase_storage, pricing),
      redis_workers: toClp(c.redis_workers, pricing),
      scan_engine: toClp(c.scan_engine, pricing),
      pdf_engine: toClp(c.pdf_engine, pricing),
      hosting: 0,
    };

    const totalCostClp = sumCategories(breakdown);
    rows.push({
      auditId: usage.auditId,
      auditTitle: usage.auditTitle,
      organizationId: usage.organizationId,
      organizationName: usage.organizationName,
      storageMb: usage.storageBytes / 1_000_000,
      scansExecuted: usage.scansExecuted,
      reportsGenerated: usage.reportsGenerated,
      dbCostClp: breakdown.supabase_db,
      totalCostClp,
      totalCostCredits: toCredits(totalCostClp, pricing),
      breakdown,
    });
  }

  rows.sort((a, b) => b.totalCostClp - a.totalCostClp);
  return rows.slice(0, limit);
}
