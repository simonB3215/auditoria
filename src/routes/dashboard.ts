import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middlewares/errorHandler.js";
import { supabaseForUser } from "../config/supabase.js";
import { evaluateCoverage } from "../services/coverageEngine.js";
import type { FindingSeverity } from "../services/findingsNormalization.js";

export const dashboardRouter = Router();

const AUDIT_STATUSES = ["draft", "queued", "running", "completed", "failed"] as const;
const SEVERITIES: FindingSeverity[] = ["critical", "high", "medium", "low"];

/**
 * Resumen agregado para /dashboard. No está en ninguna de las 4 fases de
 * a.md (esas se enfocaron en CRUD por-recurso); se agrega ahora porque el
 * frontend necesita un solo request barato para pintar el dashboard, en
 * vez de N llamadas (o de llamar GET /audits/:id/report, que genera y
 * sube un PDF nuevo cada vez como efecto secundario).
 */
dashboardRouter.get(
  "/dashboard/summary",
  authenticateToken,
  asyncHandler(async (req, res) => {
    const profile = req.profile!;
    const supabase = supabaseForUser(profile.accessToken);

    const [assetsCountRes, auditsRes, findingsRes] = await Promise.all([
      supabase.from("assets").select("id", { count: "exact", head: true }),
      supabase
        .from("audits")
        .select("id, title, framework, status, risk_score, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("findings").select("severity"),
    ]);

    if (assetsCountRes.error) throw new AppError(400, "ASSETS_COUNT_FAILED", assetsCountRes.error.message);
    if (auditsRes.error) throw new AppError(400, "AUDITS_FETCH_FAILED", auditsRes.error.message);
    if (findingsRes.error) throw new AppError(400, "FINDINGS_FETCH_FAILED", findingsRes.error.message);

    const audits = auditsRes.data ?? [];

    const auditsByStatus = Object.fromEntries(AUDIT_STATUSES.map((s) => [s, 0])) as Record<
      (typeof AUDIT_STATUSES)[number],
      number
    >;
    for (const audit of audits) {
      auditsByStatus[audit.status as (typeof AUDIT_STATUSES)[number]] += 1;
    }

    const findingsBySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<
      FindingSeverity,
      number
    >;
    for (const finding of findingsRes.data ?? []) {
      findingsBySeverity[finding.severity as FindingSeverity] += 1;
    }

    // Cobertura promedio: se recalcula por auditoría (barato: son counts por
    // audit_id, no requiere leer archivos ni Storage) y se promedia acá en
    // vez de persistirla, para no desincronizarse de las evidencias reales.
    const coverages = await Promise.all(
      audits.map((audit) => evaluateCoverage(supabase, audit.id, audit.framework))
    );
    const averageCoveragePercentage =
      coverages.length === 0
        ? 100
        : Math.round(coverages.reduce((sum, c) => sum + c.completion_percentage, 0) / coverages.length);

    res.status(200).json({
      data: {
        totalAssets: assetsCountRes.count ?? 0,
        totalAudits: audits.length,
        auditsByStatus,
        findingsBySeverity,
        averageCoveragePercentage,
        recentAudits: audits.slice(0, 5),
      },
    });
  })
);
