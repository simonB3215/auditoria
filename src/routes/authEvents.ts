import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logAuditEvent, requestContext, AUDIT_ACTIONS } from "../services/auditLogger.js";
import { sensitiveActionRateLimiter } from "../middlewares/security.js";

export const authEventsRouter = Router();

const logFailureSchema = z.object({
  email: z.string().trim().max(255).optional(),
  reason: z.string().trim().max(120),
});

/**
 * El login pega directo contra Supabase Auth desde el browser (no pasa por
 * este backend), así que no hay forma de instrumentar intentos fallidos
 * server-side sin configurar un Auth Hook de Supabase (infraestructura
 * fuera del alcance actual). Como adaptación honesta a a.md sección 4
 * ("Registrar... cualquier fallo de tipo... invalid_credentials"), el
 * propio login page reporta el fallo acá con un best-effort fetch — sin
 * token, porque en ese momento no existe sesión. Sin auth ni CORS
 * restrictivo adicional (ya cubierto por corsMiddleware + rate limit
 * estricto) para evitar que se vuelva un vector de flooding de la tabla.
 */
authEventsRouter.post(
  "/auth/log-failure",
  sensitiveActionRateLimiter,
  asyncHandler(async (req, res) => {
    const body = logFailureSchema.parse(req.body);

    await logAuditEvent({
      organizationId: null,
      actorId: null,
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
      resourceType: "auth",
      resourceId: null,
      payloadAfter: { email: body.email ?? null, reason: body.reason },
      ...requestContext(req),
    });

    res.status(204).send();
  })
);
