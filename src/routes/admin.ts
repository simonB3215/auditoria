import { Router } from "express";
import { z } from "zod";
import { authenticateToken, requirePlatformAdmin } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middlewares/errorHandler.js";
import { supabaseAdmin } from "../config/supabase.js";
import { validateUuidParams } from "../middlewares/validateParams.js";
import { logAuditEvent, requestContext, AUDIT_ACTIONS } from "../services/auditLogger.js";
import { redisConnectionForQueue } from "../config/redis.js";
import { getLatestIndicators } from "../services/economicIndicators.js";

export const adminRouter = Router();

/**
 * Visibilidad total de la plataforma: todas las organizaciones como
 * entidades de empresa puras (a.md, "Módulo Independiente de
 * Organizaciones") — sin conteos ni listas de usuarios en la fila, eso
 * ahora vive exclusivamente en `/admin/users`. Cada fila trae identidad de
 * empresa (nombre, rut, plan), dominio principal + estado de verificación
 * DNS, y una estimación de uso de Storage (suma de
 * audit_evidences.size_bytes, que ya guardamos por evidencia — evita tener
 * que llamar a la Management API de Supabase, que requiere un token
 * distinto al service_role). Usa service_role a propósito (ver migración
 * 004) — el middleware ya validó que quien llama es platform admin.
 */
adminRouter.get(
  "/admin/organizations",
  authenticateToken,
  requirePlatformAdmin,
  asyncHandler(async (_req, res) => {
    const [{ data: organizations, error: orgsError }, { data: auditRows }, { data: domainRows }] = await Promise.all([
      supabaseAdmin
        .from("organizations")
        .select("id, name, rut, plan, is_suspended, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("audits").select("id, organization_id"),
      supabaseAdmin
        .from("assets")
        .select("organization_id, value, verification_status, created_at")
        .eq("type", "domain")
        .order("created_at", { ascending: true }),
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

    // El dominio "principal" es el primero que se cargó (heurística simple:
    // no existe ningún campo que marque explícitamente cuál es el
    // principal, ver a.md — se adapta con el más antiguo de la org).
    const domainsByOrg = new Map<string, { value: string; verification_status: string }[]>();
    for (const d of domainRows ?? []) {
      const list = domainsByOrg.get(d.organization_id) ?? [];
      list.push({ value: d.value, verification_status: d.verification_status });
      domainsByOrg.set(d.organization_id, list);
    }

    const data = (organizations ?? []).map((org) => {
      const auditIds = auditIdsByOrg.get(org.id) ?? [];
      const storageBytes = auditIds.reduce((sum, auditId) => sum + (bytesByAudit.get(auditId) ?? 0), 0);
      const domains = domainsByOrg.get(org.id) ?? [];
      return {
        ...org,
        auditCount: auditIds.length,
        storageBytes,
        primaryDomain: domains[0]?.value ?? null,
        domainStats: {
          total: domains.length,
          verified: domains.filter((d) => d.verification_status === "verified").length,
        },
      };
    });

    res.status(200).json({ data });
  })
);

const updateOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  rut: z.string().trim().max(20).nullable().optional(),
  plan: z.enum(["starter", "pro", "custom"]).optional(),
});

/** Edita los datos de identidad de la empresa (nombre, rut, plan) — a.md, "Editar datos de la empresa" / "Cambiar plan". */
adminRouter.patch(
  "/admin/organizations/:id",
  authenticateToken,
  requirePlatformAdmin,
  validateUuidParams("id"),
  asyncHandler(async (req, res) => {
    const body = updateOrganizationSchema.parse(req.body);
    if (Object.keys(body).length === 0) {
      throw new AppError(400, "NO_FIELDS_TO_UPDATE", "No se envió ningún campo para actualizar");
    }

    const { data: before } = await supabaseAdmin
      .from("organizations")
      .select("name, rut, plan")
      .eq("id", req.params.id)
      .maybeSingle();
    if (!before) throw new AppError(404, "ORGANIZATION_NOT_FOUND", "Organización no encontrada");

    const { data, error } = await supabaseAdmin
      .from("organizations")
      .update(body)
      .eq("id", req.params.id)
      .select("id, name, rut, plan, is_suspended, created_at")
      .maybeSingle();

    if (error) throw new AppError(400, "ORGANIZATION_UPDATE_FAILED", error.message);
    if (!data) throw new AppError(404, "ORGANIZATION_NOT_FOUND", "Organización no encontrada");

    await logAuditEvent({
      organizationId: data.id,
      actorId: req.profile!.id,
      action: AUDIT_ACTIONS.ORGANIZATION_UPDATED,
      resourceType: "organization",
      resourceId: data.id,
      payloadBefore: before,
      payloadAfter: body,
      ...requestContext(req),
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

    await logAuditEvent({
      organizationId: data.id,
      actorId: req.profile!.id,
      action: body.suspended ? AUDIT_ACTIONS.ORGANIZATION_SUSPENDED : AUDIT_ACTIONS.ORGANIZATION_REACTIVATED,
      resourceType: "organization",
      resourceId: data.id,
      payloadAfter: { name: data.name, is_suspended: data.is_suspended },
      ...requestContext(req),
    });

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
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, name")
      .eq("id", req.params.id)
      .maybeSingle();

    // Se registra ANTES de borrar: la FK de audit_logs.organization_id
    // exige que la organización exista en el momento del insert. Después
    // del borrado, esta misma fila queda con organization_id en null (ver
    // migración 011) pero sigue consultable desde /admin/audit-logs.
    const orgId = String(req.params.id);
    await logAuditEvent({
      organizationId: orgId,
      actorId: req.profile!.id,
      action: AUDIT_ACTIONS.ORGANIZATION_DELETED,
      resourceType: "organization",
      resourceId: orgId,
      payloadBefore: org ? { name: org.name } : null,
      ...requestContext(req),
    });

    const { error } = await supabaseAdmin.from("organizations").delete().eq("id", orgId);
    if (error) {
      // 23503 = foreign_key_violation. Las FKs que sí deberían bloquear
      // esto (audit_evidences.uploaded_by, assets/audits.created_by,
      // reports.generated_by, findings.reviewed_by) ya usan
      // `on delete set null` desde la migración 018, así que este caso ya
      // no debería dispararse en operación normal — se mantiene como red
      // de seguridad ante alguna FK futura que aún no tenga esa regla, en
      // vez de filtrar el mensaje técnico crudo de Postgres al cliente.
      if (error.code === "23503") {
        throw new AppError(
          409,
          "ORGANIZATION_HAS_REFERENCED_RECORDS",
          "No se pudo eliminar la organización porque todavía tiene registros vinculados que no se pueden desasociar automáticamente."
        );
      }
      throw new AppError(400, "ORGANIZATION_DELETE_FAILED", error.message);
    }

    res.status(204).send();
  })
);

// La gestión de usuarios por organización se desacopló a `/admin/users`
// (a.md, "Módulo Independiente de Usuarios") — reemplaza al viejo
// `GET /admin/organizations/:id/members` (`?organizationId=` filtra igual
// o mejor, sin acoplar la tabla de organizaciones a datos de usuarios).

/** Dominios de una organización — a.md, "Ver auditorías y dominios de la empresa". */
adminRouter.get(
  "/admin/organizations/:id/domains",
  authenticateToken,
  requirePlatformAdmin,
  validateUuidParams("id"),
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("assets")
      .select("id, value, verification_status, created_at")
      .eq("organization_id", req.params.id)
      .eq("type", "domain")
      .order("created_at", { ascending: true });

    if (error) throw new AppError(400, "DOMAINS_LIST_FAILED", error.message);
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

    const { data: before } = await supabaseAdmin
      .from("profiles")
      .select("organization_id, role, is_platform_admin")
      .eq("id", body.userId)
      .maybeSingle();

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(update)
      .eq("id", body.userId)
      .select("id, organization_id, role, is_platform_admin")
      .maybeSingle();

    if (error) throw new AppError(400, "USER_ROLE_UPDATE_FAILED", error.message);
    if (!data) throw new AppError(404, "USER_NOT_FOUND", "Usuario no encontrado");

    await logAuditEvent({
      organizationId: data.organization_id,
      actorId: req.profile!.id,
      action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
      resourceType: "user",
      resourceId: data.id,
      payloadBefore: before ? { role: before.role, is_platform_admin: before.is_platform_admin } : null,
      payloadAfter: { role: data.role, is_platform_admin: data.is_platform_admin },
      ...requestContext(req),
    });

    res.status(200).json({ data });
  })
);

const assignOrganizationSchema = z.object({
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
});

/**
 * Reasigna directamente la organización de un usuario ya existente, sin
 * pasar por ningún flujo de invitación o registro (a.md, "Gestión directa
 * de organizaciones y permisos"). Es el único mecanismo para mover a
 * alguien de organización: el sistema de invitación por link
 * (`invite_links`) que existía antes se eliminó por completo — esto sirve
 * tanto para traer gente que ya tiene cuenta como para reorganizarla (ej.
 * sacarla de una organización personal creada al registrarse y moverla a
 * la organización corporativa correspondiente — ver a.md, "Acción de
 * Limpieza").
 *
 * a.md asume una tabla `organization_members` (relación N:M usuario↔org)
 * que no existe en este esquema: acá cada perfil pertenece a UNA sola
 * organización vía `profiles.organization_id` (ver schema.sql), así que
 * "asignar organización" es directamente actualizar esa columna — no hace
 * falta ninguna tabla intermedia nueva.
 */
adminRouter.post(
  "/admin/users/assign-organization",
  authenticateToken,
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    const body = assignOrganizationSchema.parse(req.body);

    const { data: targetOrg, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("id, name")
      .eq("id", body.organizationId)
      .maybeSingle();
    if (orgError) throw new AppError(400, "ORGANIZATION_FETCH_FAILED", orgError.message);
    if (!targetOrg) throw new AppError(404, "ORGANIZATION_NOT_FOUND", "La organización de destino no existe");

    const { data: before } = await supabaseAdmin
      .from("profiles")
      .select("organization_id")
      .eq("id", body.userId)
      .maybeSingle();
    if (!before) throw new AppError(404, "USER_NOT_FOUND", "Usuario no encontrado");
    if (before.organization_id === body.organizationId) {
      throw new AppError(409, "ALREADY_IN_ORGANIZATION", "El usuario ya pertenece a esa organización");
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({ organization_id: body.organizationId })
      .eq("id", body.userId)
      .select("id, organization_id, full_name, role, is_platform_admin")
      .maybeSingle();

    if (error) throw new AppError(400, "USER_ORGANIZATION_UPDATE_FAILED", error.message);
    if (!data) throw new AppError(404, "USER_NOT_FOUND", "Usuario no encontrado");

    await logAuditEvent({
      organizationId: body.organizationId,
      actorId: req.profile!.id,
      action: AUDIT_ACTIONS.USER_ORGANIZATION_CHANGED,
      resourceType: "user",
      resourceId: data.id,
      payloadBefore: { organizationId: before.organization_id },
      payloadAfter: { organizationId: targetOrg.id, organizationName: targetOrg.name },
      ...requestContext(req),
    });

    res.status(200).json({ data });
  })
);

/**
 * Listado global de usuarios de la plataforma (a.md, "Módulo Independiente
 * de Usuarios") — cruza `profiles` (rol, org, platform admin) con
 * `auth.users` (email, estado de la cuenta) vía la Admin API de Supabase,
 * ya que el email nunca se duplica en `profiles`. `listUsers` pagina de a
 * 1000; para una base de usuarios de este tamaño (decenas/cientos, no
 * millones) una sola página alcanza — si la plataforma creciera mucho más
 * habría que paginar de verdad acá.
 */
adminRouter.get(
  "/admin/users",
  authenticateToken,
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    const organizationId = typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;

    let query = supabaseAdmin
      .from("profiles")
      .select("id, full_name, role, is_platform_admin, organization_id, created_at, organizations(name)")
      .order("created_at", { ascending: false });
    if (organizationId) query = query.eq("organization_id", organizationId);

    const [{ data: profiles, error: profilesError }, { data: authList, error: authError }] = await Promise.all([
      query,
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    if (profilesError) throw new AppError(400, "USERS_LIST_FAILED", profilesError.message);
    if (authError) throw new AppError(400, "USERS_LIST_FAILED", authError.message);

    const authById = new Map(authList.users.map((u) => [u.id, u]));

    const data = (profiles ?? []).map((p) => {
      const authUser = authById.get(p.id);
      const org = Array.isArray(p.organizations) ? p.organizations[0] : p.organizations;
      const bannedUntil = (authUser as { banned_until?: string } | undefined)?.banned_until;
      return {
        id: p.id,
        fullName: p.full_name,
        email: authUser?.email ?? null,
        role: p.role,
        isPlatformAdmin: p.is_platform_admin,
        organizationId: p.organization_id,
        organizationName: org?.name ?? null,
        createdAt: p.created_at,
        isDeactivated: Boolean(bannedUntil && new Date(bannedUntil).getTime() > Date.now()),
      };
    });

    res.status(200).json({ data });
  })
);

const deactivateUserSchema = z.object({
  userId: z.string().uuid(),
  deactivated: z.boolean(),
});

/**
 * Desactiva/reactiva una cuenta (a.md, "o desactivar cuenta") sin borrar
 * nada: usa el "ban" nativo de Supabase Auth (bloquea login de inmediato),
 * no un flag propio — así no hace falta duplicar esa lógica en
 * `authenticateToken`. `ban_duration` no acepta "para siempre" como
 * palabra reservada, así que se usa una duración muy larga (100 años) como
 * equivalente práctico; reactivar vuelve a poner `"none"`.
 */
adminRouter.post(
  "/admin/users/deactivate",
  authenticateToken,
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    const body = deactivateUserSchema.parse(req.body);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("organization_id")
      .eq("id", body.userId)
      .maybeSingle();
    if (!profile) throw new AppError(404, "USER_NOT_FOUND", "Usuario no encontrado");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(body.userId, {
      ban_duration: body.deactivated ? "876000h" : "none",
    });
    if (error) throw new AppError(400, "USER_DEACTIVATE_FAILED", error.message);

    await logAuditEvent({
      organizationId: profile.organization_id,
      actorId: req.profile!.id,
      action: body.deactivated ? AUDIT_ACTIONS.USER_ACCOUNT_DEACTIVATED : AUDIT_ACTIONS.USER_ACCOUNT_REACTIVATED,
      resourceType: "user",
      resourceId: body.userId,
      payloadAfter: { deactivated: body.deactivated },
      ...requestContext(req),
    });

    res.status(200).json({ data: { userId: body.userId, isDeactivated: body.deactivated } });
  })
);

/**
 * Señales reales de salud de la plataforma para los badges del header de
 * /admin (a.md pedía "Estado de Workers de escaneo, Conexión a APIs") — se
 * reutiliza infraestructura que ya existe en vez de inventar un sistema de
 * monitoreo nuevo: un ping a Redis (la cola de BullMQ que corre los
 * workers de escaneo/retención/indicadores depende de esa misma conexión)
 * y el flag `stale` de los indicadores económicos (ya refleja si la última
 * consulta a Mindicador.cl funcionó).
 */
adminRouter.get(
  "/admin/system-status",
  authenticateToken,
  requirePlatformAdmin,
  asyncHandler(async (_req, res) => {
    let redisConnected = false;
    try {
      await redisConnectionForQueue.ping();
      redisConnected = true;
    } catch {
      redisConnected = false;
    }

    let economicIndicatorsFresh = false;
    try {
      const indicators = await getLatestIndicators();
      economicIndicatorsFresh = !indicators.stale;
    } catch {
      economicIndicatorsFresh = false;
    }

    res.status(200).json({ data: { redisConnected, economicIndicatorsFresh } });
  })
);
