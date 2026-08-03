import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middlewares/errorHandler.js";
import { supabaseForUser } from "../config/supabase.js";
import { validateUuidParams } from "../middlewares/validateParams.js";

export const findingsRouter = Router();

/**
 * Lista de hallazgos de una auditoría, filtrable por severidad.
 *
 * Se agrega por fuera de las 4 fases de a.md: el frontend necesita leer
 * los hallazgos para la tabla de "Visor de Reporte Ejecutivo" sin disparar
 * la generación (y re-subida) de un PDF nuevo, que es lo que hace
 * GET /audits/:id/report en cada llamada.
 */
findingsRouter.get(
  "/audits/:auditId/findings",
  authenticateToken,
  validateUuidParams("auditId"),
  asyncHandler(async (req, res) => {
    const profile = req.profile!;
    const supabase = supabaseForUser(profile.accessToken);
    const auditId = String(req.params.auditId);
    const severity = typeof req.query.severity === "string" ? req.query.severity : undefined;

    let query = supabase
      .from("findings")
      .select("id, title, severity, status, cve_id, detail, remediation, source_engine, detected_at")
      .eq("audit_id", auditId)
      .order("detected_at", { ascending: false });

    if (severity) {
      query = query.eq("severity", severity);
    }

    const { data, error } = await query;
    if (error) {
      throw new AppError(400, "FINDINGS_LIST_FAILED", error.message);
    }

    res.status(200).json({ data });
  })
);
