import { Router } from "express";
import { z } from "zod";
import { authenticateToken, requireRole } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middlewares/errorHandler.js";
import { supabaseForUser } from "../config/supabase.js";
import { validateUuidParams } from "../middlewares/validateParams.js";
import { evaluateAnciCoverage } from "../services/anciCoverageEngine.js";

export const auditsRouter = Router();

const FRAMEWORKS = ["iso27001", "nist_csf", "gdpr", "local_dp_law", "ley_21663_cl"] as const;

const createAuditSchema = z.object({
  title: z.string().trim().min(3).max(200),
  framework: z.enum(FRAMEWORKS),
  asset_ids: z.array(z.string().uuid()).max(200).optional(),
});

const updateAuditSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    framework: z.enum(FRAMEWORKS).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "Debés incluir al menos un campo a actualizar (title y/o framework)",
  });

auditsRouter.post(
  "/audits",
  authenticateToken,
  requireRole(["ciso", "auditor"]),
  asyncHandler(async (req, res) => {
    const body = createAuditSchema.parse(req.body);
    const profile = req.profile!;
    const supabase = supabaseForUser(profile.accessToken);

    const { data, error } = await supabase
      .from("audits")
      .insert({
        title: body.title,
        framework: body.framework,
        organization_id: profile.organizationId,
        created_by: profile.id,
      })
      .select()
      .single();

    if (error) {
      throw new AppError(400, "AUDIT_CREATE_FAILED", error.message);
    }

    if (body.asset_ids && body.asset_ids.length > 0) {
      const links = body.asset_ids.map((assetId) => ({ audit_id: data.id, asset_id: assetId }));
      // Si algún asset_id no pertenece a la organización, RLS lo descarta
      // en silencio (no rompe la creación de la auditoría por eso).
      const { error: linkError } = await supabase.from("audit_assets").upsert(links, {
        onConflict: "audit_id,asset_id",
      });
      if (linkError) {
        throw new AppError(400, "AUDIT_ASSETS_LINK_FAILED", linkError.message);
      }
    }

    res.status(201).json({ data });
  })
);

auditsRouter.get(
  "/audits",
  authenticateToken,
  asyncHandler(async (req, res) => {
    const profile = req.profile!;
    const supabase = supabaseForUser(profile.accessToken);

    const { data, error } = await supabase
      .from("audits")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new AppError(400, "AUDIT_LIST_FAILED", error.message);
    }

    res.status(200).json({ data });
  })
);

auditsRouter.get(
  "/audits/:id",
  authenticateToken,
  validateUuidParams("id"),
  asyncHandler(async (req, res) => {
    const profile = req.profile!;
    const supabase = supabaseForUser(profile.accessToken);

    const { data, error } = await supabase
      .from("audits")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();

    if (error) {
      throw new AppError(400, "AUDIT_FETCH_FAILED", error.message);
    }
    if (!data) {
      throw new AppError(404, "AUDIT_NOT_FOUND", "Auditoría no encontrada");
    }

    res.status(200).json({ data });
  })
);

/**
 * Cumplimiento ANCI (Ley 21.663): % diferenciado por Servicios Esenciales
 * (SE) y Operadores de Importancia Vital (OIV) + estado de los controles
 * técnicos verificados por el motor de escaneo. Devuelve 100/100 sin
 * controles para cualquier framework que no tenga requisitos con `tier`
 * (todos salvo ley_21663_cl) — el frontend solo muestra este panel cuando
 * corresponde.
 */
auditsRouter.get(
  "/audits/:id/anci-status",
  authenticateToken,
  validateUuidParams("id"),
  asyncHandler(async (req, res) => {
    const profile = req.profile!;
    const supabase = supabaseForUser(profile.accessToken);
    const auditId = String(req.params.id);

    const { data: audit, error: auditError } = await supabase
      .from("audits")
      .select("id, framework")
      .eq("id", auditId)
      .maybeSingle();
    if (auditError) throw new AppError(400, "AUDIT_FETCH_FAILED", auditError.message);
    if (!audit) throw new AppError(404, "AUDIT_NOT_FOUND", "Auditoría no encontrada o sin acceso");

    const data = await evaluateAnciCoverage(supabase, auditId, audit.framework);
    res.status(200).json({ data });
  })
);

auditsRouter.patch(
  "/audits/:id",
  authenticateToken,
  requireRole(["ciso", "auditor"]),
  validateUuidParams("id"),
  asyncHandler(async (req, res) => {
    const body = updateAuditSchema.parse(req.body);
    const profile = req.profile!;
    const supabase = supabaseForUser(profile.accessToken);

    const { data, error } = await supabase
      .from("audits")
      .update(body)
      .eq("id", req.params.id)
      .select()
      .maybeSingle();

    if (error) {
      throw new AppError(400, "AUDIT_UPDATE_FAILED", error.message);
    }
    // Cubre tres casos con la misma respuesta (por diseño, RLS no distingue
    // "no existe" de "pertenece a otra organización" ni de "sin permiso de
    // escritura por rol/ownership dentro de la misma organización"):
    if (!data) {
      throw new AppError(404, "AUDIT_NOT_FOUND", "Auditoría no encontrada o sin permiso de edición");
    }

    res.status(200).json({ data });
  })
);
