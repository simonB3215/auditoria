import { Router } from "express";
import { z } from "zod";
import { authenticateToken, requirePlatformAdmin } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middlewares/errorHandler.js";
import { supabaseAdmin } from "../config/supabase.js";
import { logAuditEvent, requestContext, AUDIT_ACTIONS } from "../services/auditLogger.js";
import { runRetentionPurge } from "../services/dataRetentionEngine.js";

export const settingsRouter = Router();

/**
 * Configuración de retención de la propia organización + estadísticas de
 * almacenamiento/purga. `organizations` no tiene policy de UPDATE (ver
 * migración 003 — solo backend con service_role escribe ahí), así que
 * tanto el GET como el PATCH usan supabaseAdmin, verificando a mano que el
 * usuario solo vea/edite su propia organización (o cualquiera, si es
 * platform admin).
 */
settingsRouter.get(
  "/settings/retention",
  authenticateToken,
  asyncHandler(async (req, res) => {
    const profile = req.profile!;

    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("id, name, retention_period_days")
      .eq("id", profile.organizationId)
      .maybeSingle();
    if (orgError) throw new AppError(400, "ORGANIZATION_FETCH_FAILED", orgError.message);
    if (!org) throw new AppError(404, "ORGANIZATION_NOT_FOUND", "Organización no encontrada");

    const { data: audits } = await supabaseAdmin.from("audits").select("id").eq("organization_id", profile.organizationId);
    const auditIds = (audits ?? []).map((a) => a.id);

    const { count: totalEvidences } =
      auditIds.length > 0
        ? await supabaseAdmin
            .from("audit_evidences")
            .select("id", { count: "exact", head: true })
            .in("audit_id", auditIds)
        : { count: 0 };

    const { count: purgedEvidences } =
      auditIds.length > 0
        ? await supabaseAdmin
            .from("audit_evidences")
            .select("id", { count: "exact", head: true })
            .in("audit_id", auditIds)
            .eq("is_purged", true)
        : { count: 0 };

    let eligibleForPurge = 0;
    if (org.retention_period_days && auditIds.length > 0) {
      const cutoff = new Date(Date.now() - org.retention_period_days * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from("audit_evidences")
        .select("id", { count: "exact", head: true })
        .in("audit_id", auditIds)
        .eq("is_purged", false)
        .lt("created_at", cutoff);
      eligibleForPurge = count ?? 0;
    }

    res.status(200).json({
      data: {
        organizationId: org.id,
        organizationName: org.name,
        retentionPeriodDays: org.retention_period_days,
        totalEvidences: totalEvidences ?? 0,
        purgedEvidences: purgedEvidences ?? 0,
        eligibleForPurge,
      },
    });
  })
);

const updateRetentionSchema = z.object({
  retentionPeriodDays: z.number().int().min(1).max(3650).nullable(),
});

settingsRouter.patch(
  "/settings/retention",
  authenticateToken,
  asyncHandler(async (req, res) => {
    const profile = req.profile!;
    if (profile.role !== "ciso" && !profile.isPlatformAdmin) {
      throw new AppError(403, "FORBIDDEN", "Solo el CISO de la organización puede configurar la retención");
    }

    const body = updateRetentionSchema.parse(req.body);

    const { data: before } = await supabaseAdmin
      .from("organizations")
      .select("retention_period_days")
      .eq("id", profile.organizationId)
      .maybeSingle();

    const { data, error } = await supabaseAdmin
      .from("organizations")
      .update({ retention_period_days: body.retentionPeriodDays })
      .eq("id", profile.organizationId)
      .select("id, retention_period_days")
      .maybeSingle();

    if (error) throw new AppError(400, "RETENTION_UPDATE_FAILED", error.message);
    if (!data) throw new AppError(404, "ORGANIZATION_NOT_FOUND", "Organización no encontrada");

    await logAuditEvent({
      organizationId: profile.organizationId,
      actorId: profile.id,
      action: AUDIT_ACTIONS.RETENTION_POLICY_UPDATED,
      resourceType: "organization",
      resourceId: profile.organizationId,
      payloadBefore: { retention_period_days: before?.retention_period_days ?? null },
      payloadAfter: { retention_period_days: data.retention_period_days },
      ...requestContext(req),
    });

    res.status(200).json({ data });
  })
);

/**
 * Dispara una pasada de purga inmediata en vez de esperar al schedule
 * diario del worker — útil para verificar la política recién configurada
 * sin esperar 24h. Solo platform admin (afecta a todas las organizaciones
 * con retención configurada, no solo la propia).
 */
settingsRouter.post(
  "/admin/retention/run-now",
  authenticateToken,
  requirePlatformAdmin,
  asyncHandler(async (_req, res) => {
    const result = await runRetentionPurge();
    res.status(200).json({ data: result });
  })
);

