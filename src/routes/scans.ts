import { Router } from "express";
import { z } from "zod";
import { authenticateToken, requireRole } from "../middlewares/auth.js";
import { sensitiveActionRateLimiter } from "../middlewares/security.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middlewares/errorHandler.js";
import { supabaseForUser } from "../config/supabase.js";
import { scanQueue, type ScanTargetAsset } from "../jobs/scanQueue.js";
import { validateUuidParams } from "../middlewares/validateParams.js";

export const scansRouter = Router();

const runScanBodySchema = z.object({
  asset_ids: z.array(z.string().uuid()).optional(),
});

scansRouter.post(
  "/audits/:auditId/run-scan",
  authenticateToken,
  requireRole(["ciso", "auditor"]),
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

    let assetsQuery = supabase
      .from("assets")
      .select("id, type, value, verification_status")
      .eq("verification_status", "verified");

    if (body.asset_ids && body.asset_ids.length > 0) {
      assetsQuery = assetsQuery.in("id", body.asset_ids);
    }

    const { data: assets, error: assetsError } = await assetsQuery;
    if (assetsError) {
      throw new AppError(400, "ASSETS_FETCH_FAILED", assetsError.message);
    }
    if (!assets || assets.length === 0) {
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
