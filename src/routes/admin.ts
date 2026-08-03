import { Router } from "express";
import { authenticateToken, requirePlatformAdmin } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middlewares/errorHandler.js";
import { supabaseAdmin } from "../config/supabase.js";
import { validateUuidParams } from "../middlewares/validateParams.js";

export const adminRouter = Router();

/**
 * Visibilidad total de la plataforma: todas las organizaciones con conteos
 * básicos. Usa service_role a propósito (ver migración 004) — ya se validó
 * en el middleware que quien llama es platform admin.
 */
adminRouter.get(
  "/admin/organizations",
  authenticateToken,
  requirePlatformAdmin,
  asyncHandler(async (_req, res) => {
    const [{ data: organizations, error: orgsError }, { data: profileCounts }, { data: auditCounts }] =
      await Promise.all([
        supabaseAdmin.from("organizations").select("id, name, created_at").order("created_at", { ascending: false }),
        supabaseAdmin.from("profiles").select("organization_id"),
        supabaseAdmin.from("audits").select("organization_id"),
      ]);

    if (orgsError) {
      throw new AppError(400, "ORGANIZATIONS_LIST_FAILED", orgsError.message);
    }

    const memberCountByOrg = new Map<string, number>();
    for (const p of profileCounts ?? []) {
      memberCountByOrg.set(p.organization_id, (memberCountByOrg.get(p.organization_id) ?? 0) + 1);
    }
    const auditCountByOrg = new Map<string, number>();
    for (const a of auditCounts ?? []) {
      auditCountByOrg.set(a.organization_id, (auditCountByOrg.get(a.organization_id) ?? 0) + 1);
    }

    const data = (organizations ?? []).map((org) => ({
      ...org,
      memberCount: memberCountByOrg.get(org.id) ?? 0,
      auditCount: auditCountByOrg.get(org.id) ?? 0,
    }));

    res.status(200).json({ data });
  })
);

/** Borra una organización (y en cascada sus assets/audits/findings/reports/profiles). */
adminRouter.delete(
  "/admin/organizations/:id",
  authenticateToken,
  requirePlatformAdmin,
  validateUuidParams("id"),
  asyncHandler(async (req, res) => {
    const { error } = await supabaseAdmin.from("organizations").delete().eq("id", req.params.id);
    if (error) {
      throw new AppError(400, "ORGANIZATION_DELETE_FAILED", error.message);
    }
    res.status(204).send();
  })
);
