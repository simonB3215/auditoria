import { Router } from "express";
import { z } from "zod";
import { authenticateToken, requirePlatformAdmin } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middlewares/errorHandler.js";
import { supabaseForUser, supabaseAdmin } from "../config/supabase.js";
import { validateUuidParams } from "../middlewares/validateParams.js";

export const auditLogsRouter = Router();

/**
 * Timeline de una auditoría puntual ("Historial de Cambios"): evidencias,
 * hallazgos y reportes de audit_logs no guardan el audit_id directamente
 * (el esquema de a.md solo define resource_type/resource_id), así que se
 * arma la lista de resource_id relacionados a esta auditoría (evidencias +
 * hallazgos + reportes que le pertenecen) y se filtra audit_logs por esos
 * ids. Un choque de UUID entre esas tablas es prácticamente imposible, así
 * que no hace falta cruzar además por resource_type.
 */
auditLogsRouter.get(
  "/audits/:auditId/history",
  authenticateToken,
  validateUuidParams("auditId"),
  asyncHandler(async (req, res) => {
    const profile = req.profile!;
    const supabase = supabaseForUser(profile.accessToken);
    const auditId = String(req.params.auditId);

    const { data: audit, error: auditError } = await supabase
      .from("audits")
      .select("id")
      .eq("id", auditId)
      .maybeSingle();
    if (auditError) throw new AppError(400, "AUDIT_FETCH_FAILED", auditError.message);
    if (!audit) throw new AppError(404, "AUDIT_NOT_FOUND", "Auditoría no encontrada o sin acceso");

    const [{ data: evidences }, { data: findings }, { data: reports }] = await Promise.all([
      supabase.from("audit_evidences").select("id").eq("audit_id", auditId),
      supabase.from("findings").select("id").eq("audit_id", auditId),
      supabase.from("reports").select("id").eq("audit_id", auditId),
    ]);

    const resourceIds = [
      auditId,
      ...(evidences ?? []).map((e) => e.id),
      ...(findings ?? []).map((f) => f.id),
      ...(reports ?? []).map((r) => r.id),
    ];

    const { data: logs, error: logsError } = await supabase
      .from("audit_logs")
      .select("id, actor_id, action, resource_type, resource_id, payload_before, payload_after, ip_address, user_agent, created_at")
      .in("resource_id", resourceIds)
      .order("created_at", { ascending: false })
      .limit(200);
    if (logsError) throw new AppError(400, "HISTORY_FETCH_FAILED", logsError.message);

    const actorIds = [...new Set((logs ?? []).map((l) => l.actor_id).filter((id): id is string => id !== null))];
    const { data: actors } =
      actorIds.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", actorIds) : { data: [] };
    const actorNameById = new Map((actors ?? []).map((a) => [a.id, a.full_name] as const));

    const data = (logs ?? []).map((log) => ({
      ...log,
      actor_name: log.actor_id ? actorNameById.get(log.actor_id) ?? null : null,
    }));

    res.status(200).json({ data });
  })
);

const listLogsQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  action: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/** Vista de plataforma completa, filtrable por organización y/o tipo de acción. */
auditLogsRouter.get(
  "/admin/audit-logs",
  authenticateToken,
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    const query = listLogsQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw new AppError(400, "INVALID_QUERY", "Parámetros de filtro inválidos");
    }

    let dbQuery = supabaseAdmin
      .from("audit_logs")
      .select("id, organization_id, actor_id, action, resource_type, resource_id, payload_before, payload_after, ip_address, user_agent, created_at")
      .order("created_at", { ascending: false })
      .limit(query.data.limit);

    if (query.data.organizationId) dbQuery = dbQuery.eq("organization_id", query.data.organizationId);
    if (query.data.action) dbQuery = dbQuery.eq("action", query.data.action);

    const { data: logs, error } = await dbQuery;
    if (error) throw new AppError(400, "AUDIT_LOGS_FETCH_FAILED", error.message);

    const orgIds = [...new Set((logs ?? []).map((l) => l.organization_id).filter((id): id is string => id !== null))];
    const actorIds = [...new Set((logs ?? []).map((l) => l.actor_id).filter((id): id is string => id !== null))];

    const [{ data: orgs }, { data: actors }] = await Promise.all([
      orgIds.length > 0 ? supabaseAdmin.from("organizations").select("id, name").in("id", orgIds) : Promise.resolve({ data: [] }),
      actorIds.length > 0 ? supabaseAdmin.from("profiles").select("id, full_name").in("id", actorIds) : Promise.resolve({ data: [] }),
    ]);
    const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name] as const));
    const actorNameById = new Map((actors ?? []).map((a) => [a.id, a.full_name] as const));

    const data = (logs ?? []).map((log) => ({
      ...log,
      organization_name: log.organization_id ? orgNameById.get(log.organization_id) ?? null : null,
      actor_name: log.actor_id ? actorNameById.get(log.actor_id) ?? null : null,
    }));

    res.status(200).json({ data });
  })
);
