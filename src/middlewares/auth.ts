import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../config/supabase.js";
import type { UserRole } from "../types/express.d.ts";
import { logAuditEvent, requestContext, AUDIT_ACTIONS } from "../services/auditLogger.js";

interface VerifiedToken {
  userId: string;
  token: string;
}

/**
 * Valida el access token contra la API de Supabase Auth (`auth.getUser`)
 * en vez de verificarlo localmente con una JWT secret propia. Esto evita
 * depender de encontrar/copiar un "JWT Secret" en un dashboard que Supabase
 * viene reorganizando (Settings > API > Settings > API Keys, con claves
 * legacy vs. publishable/secret en paralelo), y sigue funcionando sin
 * cambios si el proyecto pasa de firma HS256 (legacy, secret compartido) a
 * las claves asimétricas nuevas. El costo es un round-trip de red por
 * request en vez de una verificación local; para el volumen de este MVP
 * es una compensación aceptable a cambio de no romperse con cada cambio
 * del esquema de claves de Supabase.
 */
async function verifySupabaseToken(header: string | undefined): Promise<VerifiedToken | null> {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;

  return { userId: data.user.id, token };
}

/**
 * Valida la sesión de Supabase y carga el perfil de aplicación
 * (organization_id, role) asociado a ese usuario. El token crudo se guarda
 * en req.profile.accessToken para reusarlo en clientes Supabase scoped-a-RLS
 * en las capas de servicio (ver supabaseForUser).
 */
export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const verified = await verifySupabaseToken(req.headers.authorization);
  if (!verified) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Falta el token de autenticación o es inválido" } });
    return;
  }

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, organization_id, role, is_platform_admin, expires_at, organizations(is_suspended)")
    .eq("id", verified.userId)
    .single();

  if (error || !profile) {
    res.status(401).json({ error: { code: "PROFILE_NOT_FOUND", message: "No existe un perfil para este usuario" } });
    return;
  }

  const organization = Array.isArray(profile.organizations) ? profile.organizations[0] : profile.organizations;
  if (organization?.is_suspended && !profile.is_platform_admin) {
    res.status(403).json({
      error: { code: "ORGANIZATION_SUSPENDED", message: "Tu organización fue suspendida. Contactá al administrador." },
    });
    return;
  }

  let role = profile.role as UserRole;

  // Degradación autónoma del Piloto Invitado: en cuanto expira, la
  // siguiente request con ese token lo baja a 'viewer' — no depende de que
  // corra un job nocturno. La policy de RLS con expires_at (migración 013)
  // es la red de seguridad para la ventana entre que expira y esta
  // request; acá se persiste el cambio para que quede reflejado en la UI
  // (badge, /users/me) y no vuelva a evaluarse en cada request siguiente.
  if (role === "auditor_guest" && profile.expires_at && new Date(profile.expires_at) <= new Date()) {
    await supabaseAdmin.from("profiles").update({ role: "viewer" }).eq("id", profile.id);
    role = "viewer";
    await logAuditEvent({
      organizationId: profile.organization_id,
      actorId: null,
      action: AUDIT_ACTIONS.GUEST_ROLE_EXPIRED,
      resourceType: "user",
      resourceId: profile.id,
      payloadBefore: { role: "auditor_guest" },
      payloadAfter: { role: "viewer" },
      ...requestContext(req),
    });
  }

  req.profile = {
    id: profile.id,
    organizationId: profile.organization_id,
    role,
    accessToken: verified.token,
    isPlatformAdmin: profile.is_platform_admin,
    expiresAt: profile.expires_at,
  };

  next();
}

/**
 * Igual que authenticateToken pero SIN exigir que ya exista un `profiles`
 * row: se usa exclusivamente en el endpoint de onboarding (creación de la
 * organización + primer perfil), que es justamente el paso previo a que
 * ese profile exista.
 */
export async function authenticateTokenOnly(req: Request, res: Response, next: NextFunction): Promise<void> {
  const verified = await verifySupabaseToken(req.headers.authorization);
  if (!verified) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Falta el token de autenticación o es inválido" } });
    return;
  }
  req.userId = verified.userId;
  next();
}

/**
 * Autorización por rol. Debe usarse siempre después de authenticateToken.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.profile) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "No autenticado" } });
      return;
    }

    if (!allowedRoles.includes(req.profile.role)) {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "No tenés permisos para realizar esta acción" },
      });
      return;
    }

    next();
  };
}

/**
 * Gatea las rutas /api/v1/admin/*. Debe usarse siempre después de
 * authenticateToken. No hay forma de auto-otorgarse esto vía API — ver
 * db/promote-admin.ts.
 */
export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.profile) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "No autenticado" } });
    return;
  }

  if (!req.profile.isPlatformAdmin) {
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "Requiere permisos de administrador de plataforma" },
    });
    return;
  }

  next();
}
