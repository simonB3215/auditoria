import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authenticateToken, requireRole } from "../middlewares/auth.js";
import { sensitiveActionRateLimiter } from "../middlewares/security.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middlewares/errorHandler.js";
import { supabaseForUser } from "../config/supabase.js";
import { validateUuidParams } from "../middlewares/validateParams.js";
import { detectFileKind, validateSemanticContent } from "../services/fileValidation.js";
import { uploadEncryptedEvidence } from "../services/evidenceStorage.js";
import { evaluateCoverage } from "../services/coverageEngine.js";
import { findRequirement } from "../data/complianceRequirements.js";

export const evidencesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

const uploadBodySchema = z.object({
  requirement_code: z.string().trim().min(1).max(50).optional(),
});

evidencesRouter.post(
  "/audits/:auditId/evidences",
  authenticateToken,
  requireRole(["ciso", "auditor"]),
  validateUuidParams("auditId"),
  sensitiveActionRateLimiter,
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const profile = req.profile!;
    const supabase = supabaseForUser(profile.accessToken);
    const { auditId } = req.params;
    const body = uploadBodySchema.parse(req.body);

    if (!req.file) {
      throw new AppError(400, "FILE_REQUIRED", "Debés adjuntar un archivo en el campo 'file'");
    }

    const { data: audit, error: auditError } = await supabase
      .from("audits")
      .select("id, framework, organization_id")
      .eq("id", auditId)
      .maybeSingle();

    if (auditError) {
      throw new AppError(400, "AUDIT_FETCH_FAILED", auditError.message);
    }
    if (!audit) {
      throw new AppError(404, "AUDIT_NOT_FOUND", "Auditoría no encontrada o sin acceso");
    }

    // Capa 1: validación estructural (magic bytes)
    const structural = await detectFileKind(req.file.buffer, req.file.originalname);
    if (!structural.kind) {
      throw new AppError(422, "INVALID_FILE_STRUCTURE", structural.error ?? "Archivo no permitido");
    }

    // Capa 2: validación semántica (campos obligatorios del requisito, si aplica)
    const requirement = body.requirement_code
      ? findRequirement(audit.framework, body.requirement_code)
      : undefined;
    const semanticErrors = await validateSemanticContent(
      structural.kind,
      req.file.buffer,
      requirement?.requiredFields
    );

    const validationStatus = semanticErrors.length === 0 ? "valid" : "invalid";
    const evidenceId = randomUUID();

    const storagePath = await uploadEncryptedEvidence({
      organizationId: audit.organization_id,
      auditId: audit.id,
      evidenceId,
      fileName: req.file.originalname,
      buffer: req.file.buffer,
    });

    const { data: evidence, error: insertError } = await supabase
      .from("audit_evidences")
      .insert({
        id: evidenceId,
        audit_id: audit.id,
        uploaded_by: profile.id,
        file_name: req.file.originalname,
        mime_type: req.file.mimetype,
        size_bytes: req.file.size,
        storage_path: storagePath,
        requirement_code: body.requirement_code ?? null,
        validation_status: validationStatus,
        validation_errors: semanticErrors.length > 0 ? semanticErrors : null,
      })
      .select()
      .single();

    if (insertError) {
      throw new AppError(400, "EVIDENCE_INSERT_FAILED", insertError.message);
    }

    const coverage = await evaluateCoverage(supabase, audit.id, audit.framework);

    res.status(201).json({
      data: {
        evidence,
        validation_errors: semanticErrors,
        ...coverage,
      },
    });
  })
);
