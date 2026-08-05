import { Router } from "express";
import { z } from "zod";
import { authenticateToken, requireRole } from "../middlewares/auth.js";
import { sensitiveActionRateLimiter } from "../middlewares/security.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middlewares/errorHandler.js";
import { supabaseForUser, supabaseAdmin } from "../config/supabase.js";
import { scanQueue, type ScanTargetAsset } from "../jobs/scanQueue.js";
import { validateUuidParams } from "../middlewares/validateParams.js";
import { AUDIT_ACTIONS, logAuditEvent, requestContext } from "../services/auditLogger.js";

export const scansRouter = Router();

/** Cuota FinOps del Piloto Invitado (10 días): ver a.md, sección FINOPS & LÍMITES DE USO. */
const GUEST_SCAN_QUOTA = 3;

const runScanBodySchema = z.object({
  asset_ids: z.array(z.string().uuid()).optional(),
});

scansRouter.post(
  "/audits/:auditId/run-scan",
  authenticateToken,
  requireRole(["ciso", "auditor", "auditor_guest"]),
  validateUuidParams("auditId"),
  sensitiveActionRateLimiter,
  asyncHandler(async (req, res) => {
    const profile = req.profile!;
    const supabase = supabaseForUser(profile.accessToken);
    const auditId = String(req.params.auditId);
    const body = runScanBodySchema.parse(req.body);

    const { data: audit, error: auditError } = await supabase
      .from("audits")
      .select("id, status, organization_id")
      .eq("id", auditId)
      .maybeSingle();

    if (auditError) {
      throw new AppError(400, "AUDIT_FETCH_FAILED", auditError.message);
    }
    if (!audit) {
      throw new AppError(404, "AUDIT_NOT_FOUND", "Auditoría no encontrada");
    }
    if (audit.status === "queued" || audit.status === "running") {
      throw new AppError(409, "SCAN_ALREADY_IN_PROGRESS", "Ya hay un escaneo en curso para esta auditoría");
    }

    // Cuota del Piloto Invitado: máximo GUEST_SCAN_QUOTA escaneos ejecutados
    // por organización durante todo el trial, no por usuario — así un
    // consultor invitado no puede esquivarla creando otra sesión. scan_runs
    // no tiene policy de SELECT para `authenticated` (ver migración 006),
    // así que el conteo se hace con service_role.
    if (profile.role === "auditor_guest") {
      const { data: orgAudits } = await supabaseAdmin
        .from("audits")
        .select("id")
        .eq("organization_id", audit.organization_id);
      const orgAuditIds = (orgAudits ?? []).map((a) => a.id);
      const { count } =
        orgAuditIds.length > 0
          ? await supabaseAdmin.from("scan_runs").select("id", { count: "exact", head: true }).in("audit_id", orgAuditIds)
          : { count: 0 };
      if ((count ?? 0) >= GUEST_SCAN_QUOTA) {
        throw new AppError(
          403,
          "GUEST_SCAN_QUOTA_EXCEEDED",
          `El Piloto Invitado permite un máximo de ${GUEST_SCAN_QUOTA} escaneos durante el período de prueba`
        );
      }
    }

    let assets: Array<{ id: string; type: string; value: string; verification_status: string }> = [];

    if (body.asset_ids && body.asset_ids.length > 0) {
      // Security gate explícito (a.md, sección "Security Gate"): si el
      // cliente pide activos puntuales por id, hay que distinguir "no
      // verificado" de "no existe / no es tuyo" — este segundo caso ya lo
      // cubre RLS (el activo ajeno ni siquiera aparece). Si aparece pero no
      // está verificado, no se lo descarta en silencio: se aborta TODA la
      // solicitud con 403 y se audita el intento, tal como pide a.md.
      const { data: requested, error: requestedError } = await supabase
        .from("assets")
        .select("id, type, value, verification_status")
        .in("id", body.asset_ids);
      if (requestedError) {
        throw new AppError(400, "ASSETS_FETCH_FAILED", requestedError.message);
      }
      const unverified = (requested ?? []).filter((a) => a.verification_status !== "verified");
      if (unverified.length > 0) {
        await logAuditEvent({
          organizationId: audit.organization_id,
          actorId: profile.id,
          action: AUDIT_ACTIONS.UNAUTHORIZED_SCAN_BLOCKED,
          resourceType: "scan",
          resourceId: auditId,
          payloadAfter: {
            unverifiedAssets: unverified.map((a) => ({ id: a.id, type: a.type, value: a.value })),
          },
          ...requestContext(req),
        });
        throw new AppError(
          403,
          "UNAUTHORIZED_SCAN_TARGET",
          `No se puede ejecutar el escaneo: ${unverified.length} activo(s) seleccionado(s) no tiene(n) su propiedad verificada. Verificá el dominio con POST /assets/:id/verify antes de reintentar.`
        );
      }
      assets = requested ?? [];
    } else {
      const { data, error: assetsError } = await supabase
        .from("assets")
        .select("id, type, value, verification_status")
        .eq("verification_status", "verified");
      if (assetsError) {
        throw new AppError(400, "ASSETS_FETCH_FAILED", assetsError.message);
      }
      assets = data ?? [];
    }

    if (assets.length === 0) {
      throw new AppError(
        422,
        "NO_VERIFIED_ASSETS",
        "No hay activos verificados para escanear. Verificá la propiedad del activo con POST /assets/:id/verify antes de lanzar un escaneo."
      );
    }

    const scanTargets: ScanTargetAsset[] = assets.map((a) => ({
      assetId: a.id,
      assetType: a.type as ScanTargetAsset["assetType"],
      assetValue: a.value,
    }));

    // Vincula los activos escaneados al alcance de esta auditoría (audit_assets).
    const links = scanTargets.map((a) => ({ audit_id: auditId, asset_id: a.assetId }));
    const { error: linkError } = await supabase.from("audit_assets").upsert(links, {
      onConflict: "audit_id,asset_id",
    });
    if (linkError) {
      throw new AppError(400, "AUDIT_ASSETS_LINK_FAILED", linkError.message);
    }

    await supabase.from("audits").update({ status: "queued" }).eq("id", auditId);

    const job = await scanQueue.add("run-scan", {
      organizationId: audit.organization_id,
      auditId,
      assets: scanTargets,
      actorId: profile.id,
    });

    res.status(202).json({
      data: {
        auditId,
        jobId: job.id,
        status: "queued",
        scannedAssets: scanTargets.map((a) => a.assetValue),
      },
    });
  })
);
