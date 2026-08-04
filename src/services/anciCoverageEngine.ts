import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../config/supabase.js";
import { getRequirementsForFramework } from "../data/complianceRequirements.js";

export type TechnicalControlStatus = "ok" | "fail" | "not_scanned";

export interface TechnicalControlResult {
  code: string;
  title: string;
  status: TechnicalControlStatus;
}

export interface AnciCoverageResult {
  sePercentage: number;
  oivPercentage: number;
  technicalControls: TechnicalControlResult[];
}

function evaluateTechnicalCheck(
  check: string,
  findings: { source_engine: string; severity: string }[],
  hasScanRun: boolean
): TechnicalControlStatus {
  if (!hasScanRun) return "not_scanned";

  switch (check) {
    case "asset_inventory":
      // Si hubo al menos un scan_run, el motor relevó el inventario de
      // puertos/servicios expuestos por definición — no hay un "fail" acá,
      // solo escaneado o no.
      return "ok";
    case "tls_encryption":
      return findings.some((f) => f.source_engine === "tls-check") ? "fail" : "ok";
    case "http_headers":
      return findings.some((f) => f.source_engine === "http-headers") ? "fail" : "ok";
    case "vulnerability_management":
      return findings.some((f) => f.source_engine === "nmap" && (f.severity === "critical" || f.severity === "high"))
        ? "fail"
        : "ok";
    default:
      return "not_scanned";
  }
}

/**
 * Cumplimiento ANCI (Ley 21.663): a diferencia de `evaluateCoverage`
 * (cobertura documental genérica), acá se combinan evidencias documentales
 * Y hallazgos del motor de escaneo, agrupados en dos porcentajes según el
 * nivel de obligación — Servicios Esenciales (SE, piso común) y Operadores
 * de Importancia Vital (OIV, que ACUMULA todo lo de SE más sus propios
 * requisitos exclusivos, nunca es un conjunto separado).
 *
 * `scan_runs` no tiene policy de SELECT para `authenticated` (ver
 * migración 006), así que esa verificación puntual usa service_role
 * directo — el resto de las lecturas (findings, evidencias) sí respetan el
 * cliente scoped-a-RLS que se recibe por parámetro.
 */
export async function evaluateAnciCoverage(
  supabase: SupabaseClient,
  auditId: string,
  framework: string
): Promise<AnciCoverageResult> {
  const requirements = getRequirementsForFramework(framework);
  const tieredRequirements = requirements.filter((r) => r.tier);

  if (tieredRequirements.length === 0) {
    return { sePercentage: 100, oivPercentage: 100, technicalControls: [] };
  }

  const [{ data: findings }, { data: evidences }, { count: scanRunCount }] = await Promise.all([
    supabase.from("findings").select("source_engine, severity").eq("audit_id", auditId),
    supabase.from("audit_evidences").select("requirement_code").eq("audit_id", auditId).eq("validation_status", "valid"),
    supabaseAdmin.from("scan_runs").select("id", { count: "exact", head: true }).eq("audit_id", auditId),
  ]);

  const hasScanRun = (scanRunCount ?? 0) > 0;
  const validCodes = new Set(
    (evidences ?? []).map((e) => e.requirement_code).filter((c): c is string => Boolean(c))
  );

  const status: Record<string, boolean> = {};
  const technicalControls: TechnicalControlResult[] = [];

  for (const req of tieredRequirements) {
    if (req.kind === "technical" && req.technicalCheck) {
      const controlStatus = evaluateTechnicalCheck(req.technicalCheck, findings ?? [], hasScanRun);
      technicalControls.push({ code: req.code, title: req.title, status: controlStatus });
      status[req.code] = controlStatus === "ok";
    } else {
      status[req.code] = validCodes.has(req.code);
    }
  }

  function percentageFor(requirements: typeof tieredRequirements): number {
    if (requirements.length === 0) return 100;
    const satisfied = requirements.filter((r) => status[r.code]).length;
    return Math.round((satisfied / requirements.length) * 100);
  }

  return {
    sePercentage: percentageFor(tieredRequirements.filter((r) => r.tier === "SE")),
    oivPercentage: percentageFor(tieredRequirements),
    technicalControls,
  };
}
