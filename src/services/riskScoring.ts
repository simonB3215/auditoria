import type { FindingSeverity } from "./findingsNormalization.js";

/**
 * Puntaje = 100 - (Σ Hallazgos por Severidad + Penalización por Cobertura Incompleta)
 * (fórmula tal como está especificada en a.md, Fase 4).
 *
 * Pesos de severidad y peso de la penalización por cobertura son parámetros
 * de negocio razonables para un MVP; se documentan explícitamente para que
 * sean fáciles de ajustar sin tocar la lógica de cálculo.
 */
const SEVERITY_WEIGHT: Record<FindingSeverity, number> = {
  critical: 20,
  high: 10,
  medium: 5,
  low: 2,
};

/** Cuánto pesa cada punto porcentual de cobertura documental faltante. */
const COVERAGE_PENALTY_FACTOR = 0.3;

export interface RiskScoreInput {
  findingsBySeverity: Record<FindingSeverity, number>;
  completionPercentage: number; // 0-100
}

export interface RiskScoreResult {
  score: number; // 0-100
  findingsPenalty: number;
  coveragePenalty: number;
  complianceLevel: "alto" | "medio" | "bajo" | "crítico";
}

export function calculateRiskScore(input: RiskScoreInput): RiskScoreResult {
  const findingsPenalty = (Object.entries(input.findingsBySeverity) as [FindingSeverity, number][]).reduce(
    (total, [severity, count]) => total + SEVERITY_WEIGHT[severity] * count,
    0
  );

  const coveragePenalty = Math.round((100 - input.completionPercentage) * COVERAGE_PENALTY_FACTOR);

  const score = clamp(100 - findingsPenalty - coveragePenalty, 0, 100);

  return {
    score,
    findingsPenalty,
    coveragePenalty,
    complianceLevel: levelForScore(score),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function levelForScore(score: number): RiskScoreResult["complianceLevel"] {
  if (score >= 85) return "alto";
  if (score >= 60) return "medio";
  if (score >= 40) return "bajo";
  return "crítico";
}
