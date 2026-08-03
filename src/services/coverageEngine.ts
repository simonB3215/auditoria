import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequirementsForFramework } from "../data/complianceRequirements.js";

export interface CoverageResult {
  completion_percentage: number;
  missing_requirements: Array<{ code: string; title: string }>;
  covered_requirements: string[];
}

/**
 * Compara las evidencias cargadas (y validadas) de una auditoria contra la
 * lista de requisitos minimos del framework seleccionado, y calcula el
 * porcentaje de cobertura documental.
 */
export async function evaluateCoverage(
  supabase: SupabaseClient,
  auditId: string,
  framework: string
): Promise<CoverageResult> {
  const requirements = getRequirementsForFramework(framework);

  const { data: evidences, error } = await supabase
    .from("audit_evidences")
    .select("requirement_code, validation_status")
    .eq("audit_id", auditId)
    .eq("validation_status", "valid");

  if (error) {
    throw new Error(`No se pudo calcular la cobertura: ${error.message}`);
  }

  const coveredCodes = new Set(
    (evidences ?? [])
      .map((e) => e.requirement_code)
      .filter((code): code is string => Boolean(code))
  );

  const missing = requirements.filter((r) => !coveredCodes.has(r.code));
  const coveredCount = requirements.length - missing.length;
  const completionPercentage =
    requirements.length === 0 ? 100 : Math.round((coveredCount / requirements.length) * 100);

  return {
    completion_percentage: completionPercentage,
    missing_requirements: missing.map((r) => ({ code: r.code, title: r.title })),
    covered_requirements: [...coveredCodes],
  };
}
