import type { Request } from "express";
import { supabaseAdmin } from "../config/supabase.js";

/**
 * Acciones instrumentadas. No es un enum de BD (audit_logs.action es
 * `text` libre) para no requerir una migración cada vez que se agrega un
 * evento nuevo — esta lista es la referencia de qué valores existen hoy.
 */
export const AUDIT_ACTIONS = {
  EVIDENCE_UPLOADED: "EVIDENCE_UPLOADED",
  FINDING_STATUS_CHANGED: "FINDING_STATUS_CHANGED",
  REPORT_GENERATED: "REPORT_GENERATED",
  USER_ROLE_CHANGED: "USER_ROLE_CHANGED",
  ORGANIZATION_SUSPENDED: "ORGANIZATION_SUSPENDED",
  ORGANIZATION_REACTIVATED: "ORGANIZATION_REACTIVATED",
  ORGANIZATION_DELETED: "ORGANIZATION_DELETED",
  RETENTION_POLICY_UPDATED: "RETENTION_POLICY_UPDATED",
  EVIDENCE_PURGED: "EVIDENCE_PURGED",
  USER_INVITED: "USER_INVITED",
  INVITATION_ACCEPTED: "INVITATION_ACCEPTED",
  GUEST_ROLE_EXPIRED: "GUEST_ROLE_EXPIRED",
  SCAN_EXECUTED: "SCAN_EXECUTED",
} as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export type AuditResourceType = "evidence" | "finding" | "report" | "user" | "organization" | "scan";

interface LogAuditEventParams {
  organizationId: string;
  actorId: string | null;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string | null;
  payloadBefore?: unknown;
  payloadAfter?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Escribe un evento en `audit_logs` con service_role (la tabla no acepta
 * UPDATE/DELETE de ningún rol — ver migración 009). Nunca debe poder
 * tumbar la operación de negocio que la originó: los errores se registran
 * en consola pero no se propagan.
 */
export async function logAuditEvent(params: LogAuditEventParams): Promise<void> {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    organization_id: params.organizationId,
    actor_id: params.actorId,
    action: params.action,
    resource_type: params.resourceType,
    resource_id: params.resourceId,
    payload_before: params.payloadBefore ?? null,
    payload_after: params.payloadAfter ?? null,
    ip_address: params.ipAddress ?? null,
    user_agent: params.userAgent ?? null,
  });

  if (error) {
    console.error(`[audit-logger] no se pudo registrar el evento ${params.action}:`, error.message);
  }
}

/** IP y user-agent del request, para adjuntar al log sin repetir esto en cada ruta. */
export function requestContext(req: Request): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  };
}
