import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { supabaseAdmin } from "../config/supabase.js";
import type { UserRole } from "../types/express.d.ts";

interface SupabaseAccessTokenPayload {
  sub: string;
  aud: string | string[];
  exp: number;
  role?: string;
}

/**
 * Valida el JWT emitido por Supabase Auth y carga el perfil de aplicación
 * (organization_id, role) asociado a ese usuario. El token crudo se guarda
 * en req.profile.accessToken para reusarlo en clientes Supabase scoped-a-RLS
 * en las capas de servicio (ver supabaseForUser).
 */
export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Falta el token de autenticación" } });
    return;
  }

  const token = header.slice("Bearer ".length).trim();

  let payload: SupabaseAccessTokenPayload;
  try {
    payload = jwt.verify(token, env.SUPABASE_JWT_SECRET, {
      algorithms: ["HS256"],
    }) as SupabaseAccessTokenPayload;
  } catch {
    res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token inválido o expirado" } });
    return;
  }

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, organization_id, role")
    .eq("id", payload.sub)
    .single();

  if (error || !profile) {
    res.status(401).json({ error: { code: "PROFILE_NOT_FOUND", message: "No existe un perfil para este usuario" } });
    return;
  }

  req.profile = {
    id: profile.id,
    organizationId: profile.organization_id,
    role: profile.role as UserRole,
    accessToken: token,
  };

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
