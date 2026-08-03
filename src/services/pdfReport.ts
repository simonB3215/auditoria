import PDFDocument from "pdfkit";
import type { RiskScoreResult } from "./riskScoring.js";
import type { CoverageResult } from "./coverageEngine.js";
import type { FindingSeverity } from "./findingsNormalization.js";

export interface ReportFinding {
  title: string;
  severity: FindingSeverity;
  detail: string | null;
  remediation: string | null;
}

export interface ReportEvidenceIssue {
  file_name: string;
  requirement_code: string | null;
  validation_errors: string[] | null;
}

export interface BuildReportInput {
  auditTitle: string;
  framework: string;
  generatedAt: Date;
  riskScore: RiskScoreResult;
  coverage: CoverageResult;
  findings: ReportFinding[];
  invalidEvidences: ReportEvidenceIssue[];
}

const SEVERITY_ORDER: FindingSeverity[] = ["critical", "high", "medium", "low"];
const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

export async function buildAuditReportPdf(input: BuildReportInput): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  // --- Portada / Resumen ejecutivo ---
  doc.fontSize(20).text("Aegis CyberAudit — Reporte de Auditoría", { align: "center" });
  doc.moveDown();
  doc.fontSize(12).text(`Auditoría: ${input.auditTitle}`);
  doc.text(`Framework: ${input.framework.toUpperCase()}`);
  doc.text(`Generado: ${input.generatedAt.toLocaleString("es-AR")}`);
  doc.moveDown();

  doc.fontSize(16).text("Resumen Ejecutivo", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12).text(`Puntaje de Riesgo: ${input.riskScore.score} / 100`);
  doc.text(`Nivel de Cumplimiento: ${input.riskScore.complianceLevel.toUpperCase()}`);
  doc.text(`Cobertura documental: ${input.coverage.completion_percentage}%`);
  doc.text(
    `(Penalización por hallazgos: -${input.riskScore.findingsPenalty} | Penalización por cobertura incompleta: -${input.riskScore.coveragePenalty})`
  );
  doc.moveDown();

  // --- Evidencias faltantes / con errores ---
  doc.fontSize(16).text("Evidencias Faltantes e Incoherencias Detectadas", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12);
  if (input.coverage.missing_requirements.length === 0) {
    doc.text("No hay requisitos pendientes de evidencia.");
  } else {
    doc.text("Requisitos sin evidencia válida:");
    for (const req of input.coverage.missing_requirements) {
      doc.text(`  • [${req.code}] ${req.title}`);
    }
  }
  doc.moveDown(0.5);
  if (input.invalidEvidences.length > 0) {
    doc.text("Evidencias cargadas con incoherencias:");
    for (const ev of input.invalidEvidences) {
      doc.text(`  • ${ev.file_name}${ev.requirement_code ? ` (${ev.requirement_code})` : ""}`);
      for (const err of ev.validation_errors ?? []) {
        doc.text(`      - ${err}`);
      }
    }
  }
  doc.moveDown();

  // --- Desglose de hallazgos ---
  doc.fontSize(16).text("Desglose de Hallazgos y Sugerencias de Remediación", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(12);

  if (input.findings.length === 0) {
    doc.text("No se registraron hallazgos técnicos.");
  } else {
    for (const severity of SEVERITY_ORDER) {
      const group = input.findings.filter((f) => f.severity === severity);
      if (group.length === 0) continue;

      doc.fontSize(13).text(`Severidad ${SEVERITY_LABEL[severity]} (${group.length})`, { underline: true });
      doc.fontSize(11);
      for (const finding of group) {
        doc.moveDown(0.2);
        doc.text(`• ${finding.title}`);
        if (finding.detail) doc.text(`  Detalle: ${finding.detail}`);
        if (finding.remediation) doc.text(`  Remediación sugerida: ${finding.remediation}`);
      }
      doc.moveDown(0.5);
    }
  }

  doc.end();
  return done;
}
