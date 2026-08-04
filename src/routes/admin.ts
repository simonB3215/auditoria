import { Router } from "express";
import { z } from "zod";
import { authenticateToken, requirePlatformAdmin } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middlewares/errorHandler.js";
import { supabaseAdmin } from "../config/supabase.js";
import { validateUuidParams } from "../middlewares/validateParams.js";

export const adminRouter = Router();

/**
 * Visibilidad total de la plataforma: todas las organizaciones con conteos
 * básicos y una estimación de uso de Storage (suma de audit_evidences.size_bytes,
 * que ya guardamos por evidencia — evita tener que llamar a la Management
 * API de Supabase, que requiere un token distinto al service_role).
 * Usa service_role a propósito (ver migración 004) — el middleware ya
 * validó que quien llama es platform admin.
 */
adminRouter.get(
  "/admin/organizations",
  authenticateToken,
  requirePlatformAdmin,
  asyncHandler(async (_req, res) => {
    const [{ data: organizations, error: orgsError }, { data: profileRows }, { data: auditRows }] =
      await Promise.all([
        supabaseAdmin
          .from("organizations")
          .select("id, name, is_suspended, created_at")
          .order("created_at", { ascending: false }),
        supabaseAdmin.from("profiles").select("organization_id"),
        supabaseAdmin.from("audits").select("id, organization_id"),
      ]);

    if (orgsError) {
      throw new AppError(400, "ORGANIZATIONS_LIST_FAILED", orgsError.message);
    }

    const auditIdsByOrg = new Map<string, string[]>();
    for (const a of auditRows ?? []) {
      const list = auditIdsByOrg.get(a.organization_id) ?? [];
      list.push(a.id);
      auditIdsByOrg.set(a.organization_id, list);
    }

    const { data: evidenceRows } = await supabaseAdmin.from("audit_evidences").select("audit_id, size_bytes");
    const bytesByAudit = new Map<string, number>();
    for (const e of evidenceRows ?? []) {
      bytesByAudit.set(e.audit_id, (bytesByAudit.get(e.audit_id) ?? 0) + (e.size_bytes ?? 0));
    }

    const memberCountByOrg = new Map<string, number>();
    for (const p of profileRows ?? []) {
      memberCountByOrg.set(p.organization_id, (memberCountByOrg.get(p.organization_id) ?? 0) + 1);
    }

    const data = (organizations ?? []).map((org) => {
      const auditIds = auditIdsByOrg.get(org.id) ?? [];
      const storageBytes = auditIds.reduce((sum, auditId) => sum + (bytesByAudit.get(auditId) ?? 0), 0);
      return {
        ...org,
        memberCount: memberCountByOrg.get(org.id) ?? 0,
        auditCount: auditIds.length,
        storageBytes,
      };
    });

    res.status(200).json({ data });
  })
);

/** Suspende/reactiva una organización (bloquea el acceso de sus usuarios, ver authenticateToken). */
adminRouter.patch(
  "/admin/organizations/:id/suspend",
  authenticateToken,
  requirePlatformAdmin,
  validateUuidParams("id"),
  asyncHandler(async (req, res) => {
    const body = z.object({ suspended: z.boolean() }).parse(req.body);

    const { data, error } = await supabaseAdmin
      .from("organizations")
      .update({ is_suspended: body.suspended })
      .eq("id", req.params.id)
      .select("id, name, is_suspended")
      .maybeSingle();

    if (error) throw new AppError(400, "ORGANIZATION_SUSPEND_FAILED", error.message);
    if (!data) throw new AppError(404, "ORGANIZATION_NOT_FOUND", "Organización no encontrada");

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

/** Miembros de una organización, para la tabla de gestión de roles en /admin. */
adminRouter.get(
  "/admin/organizations/:id/members",
  authenticateToken,
  requirePlatformAdmin,
  validateUuidParams("id"),
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role, is_platform_admin, created_at")
      .eq("organization_id", req.params.id)
      .order("created_at", { ascending: true });

    if (error) throw new AppError(400, "MEMBERS_LIST_FAILED", error.message);
    res.status(200).json({ data });
  })
);

/**
 * Actividad reciente de una organización: combina los últimos audits,
 * assets y evidencias creados. No es un log de auditoría exhaustivo
 * (eso requeriría instrumentar cada escritura con una tabla dedicada);
 * es una vista rápida basada en los `created_at` que ya existen.
 */
adminRouter.get(
  "/admin/organizations/:id/activity",
  authenticateToken,
  requirePlatformAdmin,
  validateUuidParams("id"),
  asyncHandler(async (req, res) => {
    const orgId = req.params.id;

    const [{ data: audits }, { data: assets }] = await Promise.all([
      supabaseAdmin
        .from("audits")
        .select("id, title, status, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("assets")
        .select("id, type, value, created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const auditIds = (audits ?? []).map((a) => a.id);
    const { data: evidences } =
      auditIds.length > 0
        ? await supabaseAdmin
            .from("audit_evidences")
            .select("id, file_name, audit_id, created_at")
            .in("audit_id", auditIds)
            .order("created_at", { ascending: false })
            .limit(10)
        : { data: [] };

    const events = [
      ...(audits ?? []).map((a) => ({
        type: "audit_created" as const,
        label: `Auditoría creada: ${a.title}`,
        createdAt: a.created_at,
      })),
      ...(assets ?? []).map((a) => ({
        type: "asset_created" as const,
        label: `Activo agregado: [${a.type}] ${a.value}`,
        createdAt: a.created_at,
      })),
      ...(evidences ?? []).map((e) => ({
        type: "evidence_uploaded" as const,
        label: `Evidencia cargada: ${e.file_name}`,
        createdAt: e.created_at,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.status(200).json({ data: events.slice(0, 20) });
  })
);

const updateRoleSchema = z
  .object({
    userId: z.string().uuid(),
    role: z.enum(["ciso", "auditor", "viewer"]).optional(),
    isPlatformAdmin: z.boolean().optional(),
  })
  .refine((b) => b.role !== undefined || b.isPlatformAdmin !== undefined, {
    message: "Debés incluir role y/o isPlatformAdmin",
  });

/**
 * Cambia el rol (dentro de su organización) y/o el flag de platform admin
 * de un usuario. Gateado por requirePlatformAdmin: nadie puede llamarlo sin
 * ya ser platform admin, así que esto no reabre la puerta de
 * auto-escalación que db/promote-admin.ts existe para cerrar — es una
 * herramienta para que un admin YA verificado gestione al resto.
 */
adminRouter.post(
  "/admin/users/role",
  authenticateToken,
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    const body = updateRoleSchema.parse(req.body);
    const update: Record<string, unknown> = {};
    if (body.role !== undefined) update.role = body.role;
    if (body.isPlatformAdmin !== undefined) update.is_platform_admin = body.isPlatformAdmin;

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(update)
      .eq("id", body.userId)
      .select("id, organization_id, role, is_platform_admin")
      .maybeSingle();

    if (error) throw new AppError(400, "USER_ROLE_UPDATE_FAILED", error.message);
    if (!data) throw new AppError(404, "USER_NOT_FOUND", "Usuario no encontrado");

    res.status(200).json({ data });
  })
);
