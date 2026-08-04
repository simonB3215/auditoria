import { Router } from "express";
import { randomUUID } from "node:crypto";
import { authenticateToken, requireRole } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middlewares/errorHandler.js";
import { supabaseForUser, supabaseAdmin } from "../config/supabase.js";
import { validateUuidParams } from "../middlewares/validateParams.js";
import { env } from "../config/env.js";
import { evaluateCoverage } from "../services/coverageEngine.js";
import { calculateRiskScore } from "../services/riskScoring.js";
import { buildAuditReportPdf, type ReportFinding, type ReportEvidenceIssue } from "../services/pdfReport.js";
import type { FindingSeverity } from "../services/findingsNormalization.js";
import { logAuditEvent, requestContext, AUDIT_ACTIONS } from "../services/auditLogger.js";

const SIGNED_URL_TTL_SECONDS = 5 * 60;

export const reportsRouter = Router();

reportsRouter.get(
  "/audits/:auditId/report",
  authenticateToken,
  requireRole(["ciso", "auditor", "viewer"]),
  validateUuidParams("auditId"),
  asyncHandler(async (req, res) => {
    const profile = req.profile!;
    const supabase = supabaseForUser(profile.accessToken);
    const auditId = String(req.params.auditId);

    const { data: audit, error: auditError } = await supabase
      .from("audits")
      .select("id, title, framework, organization_id")
      .eq("id", auditId)
      .maybeSingle();

    if (auditError) {
      throw new AppError(400, "AUDIT_FETCH_FAILED", auditError.message);
    }
    if (!audit) {
      throw new AppError(404, "AUDIT_NOT_FOUND", "Auditoría no encontrada");
    }

    const [{ data: findings, error: findingsError }, { data: evidences, error: evidencesError }] =
      await Promise.all([
        supabase.from("findings").select("title, severity, status, detail, remediation").eq("audit_id", auditId),
        supabase
          .from("audit_evidences")
          .select("file_name, requirement_code, validation_errors")
          .eq("audit_id", auditId)
          .eq("validation_status", "invalid"),
      ]);

    if (findingsError) throw new AppError(400, "FINDINGS_FETCH_FAILED", findingsError.message);
    if (evidencesError) throw new AppError(400, "EVIDENCES_FETCH_FAILED", evidencesError.message);

    const coverage = await evaluateCoverage(supabase, auditId, audit.framework);

    // Un hallazgo marcado como falso positivo o riesgo aceptado (con
    // justificación de un auditor, ver PATCH /findings/:id/status) ya no
    // representa un riesgo real: no debe penalizar el puntaje, aunque sigue
    // apareciendo en el reporte para dejar constancia de la decisión.
    const severityCounts: Record<FindingSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const finding of findings ?? []) {
      if (finding.status === "false_positive" || finding.status === "accepted_risk") continue;
      severityCounts[finding.severity as FindingSeverity] += 1;
    }

    const riskScore = calculateRiskScore({
      findingsBySeverity: severityCounts,
      completionPercentage: coverage.completion_percentage,
    });

    const pdfBuffer = await buildAuditReportPdf({
      auditTitle: audit.title,
      framework: audit.framework,
      generatedAt: new Date(),
      riskScore,
      coverage,
      findings: (findings ?? []) as ReportFinding[],
      invalidEvidences: (evidences ?? []) as ReportEvidenceIssue[],
    });

    const reportId = randomUUID();
    // El bucket de reportes es privado y solo se accede vía signed URL de
    // corta duración (ver abajo); a diferencia de las evidencias (documentos
    // fuente sensibles y de vida larga), el reporte no se cifra a nivel de
    // aplicación para poder servirlo directo desde Supabase Storage.
    const storagePath = `${audit.organization_id}/${auditId}/${reportId}.pdf`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(env.REPORTS_BUCKET)
      .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: false });
    if (uploadError) {
      throw new AppError(500, "REPORT_UPLOAD_FAILED", uploadError.message);
    }

    const { error: reportInsertError } = await supabase.from("reports").insert({
      id: reportId,
      audit_id: auditId,
      generated_by: profile.id,
      storage_path: storagePath,
      risk_score: riskScore.score,
    });
    if (reportInsertError) {
      throw new AppError(400, "REPORT_INSERT_FAILED", reportInsertError.message);
    }

    // risk_score es un campo derivado por el sistema: se actualiza con
    // service_role para no depender de que quien genera el reporte sea
    // el creador de la auditoría o tenga rol 'ciso' (ver RLS de `audits`).
    await supabaseAdmin.from("audits").update({ risk_score: riskScore.score }).eq("id", auditId);

    const { data: signed, error: signedUrlError } = await supabaseAdmin.storage
      .from(env.REPORTS_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    if (signedUrlError || !signed) {
      throw new AppError(500, "SIGNED_URL_FAILED", signedUrlError?.message ?? "No se pudo firmar el link de descarga");
    }

    // Un solo endpoint genera Y entrega el reporte (el signedUrl que se
    // descarga es esta misma respuesta), así que un evento cubre ambas
    // acciones que pide a.md ("generación y descarga").
    await logAuditEvent({
      organizationId: audit.organization_id,
      actorId: profile.id,
      action: AUDIT_ACTIONS.REPORT_GENERATED,
      resourceType: "report",
      resourceId: reportId,
      payloadAfter: { auditId, riskScore: riskScore.score, complianceLevel: riskScore.complianceLevel },
      ...requestContext(req),
    });

    res.status(200).json({
      data: {
        reportId,
        auditId,
        signedUrl: signed.signedUrl,
        expiresInSeconds: SIGNED_URL_TTL_SECONDS,
        riskScore: {
          score: riskScore.score,
          complianceLevel: riskScore.complianceLevel,
          findingsPenalty: riskScore.findingsPenalty,
          coveragePenalty: riskScore.coveragePenalty,
        },
        coverage,
      },
    });
  })
);
