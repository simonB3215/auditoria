import { Router } from "express";
import { z } from "zod";
import { authenticateToken, authenticateTokenOnly, requirePlatformAdmin } from "../middlewares/auth.js";
import { sensitiveActionRateLimiter } from "../middlewares/security.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middlewares/errorHandler.js";
import { supabaseAdmin } from "../config/supabase.js";
import { env } from "../config/env.js";
import { validateUuidParams } from "../middlewares/validateParams.js";
import { logAuditEvent, requestContext, AUDIT_ACTIONS } from "../services/auditLogger.js";
import { sendGuestEmail } from "../services/emailTemplates.js";

export const invitationsRouter = Router();

const GUEST_TRIAL_DAYS = 10;
const LINK_VALID_DAYS = 7;

const inviteSchema = z.object({
  email: z.string().trim().email().optional(),
  temporaryAccess: z.boolean().default(false),
});

/**
 * Genera un link de invitación — no envía nada por email. El email del
 * invitado es un dato opcional (solo referencia de a quién se pensaba
 * invitar); quien reciba el link se registra con el email que quiera desde
 * /register?invite=<id>. Restringido a platform admin: dar de alta acceso
 * a una organización se trata con el mismo nivel de privilegio que el
 * resto de `/admin/*`, no como una acción delegable a cualquier `ciso`.
 */
invitationsRouter.post(
  "/invitations",
  authenticateToken,
  requirePlatformAdmin,
  sensitiveActionRateLimiter,
  asyncHandler(async (req, res) => {
    const profile = req.profile!;
    const body = inviteSchema.parse(req.body);
    const role = body.temporaryAccess ? "auditor_guest" : "auditor";

    const { data: link, error } = await supabaseAdmin
      .from("invite_links")
      .insert({
        organization_id: profile.organizationId,
        role,
        email: body.email ?? null,
        created_by: profile.id,
        expires_at: new Date(Date.now() + LINK_VALID_DAYS * 86_400_000).toISOString(),
      })
      .select("id, role, email, expires_at")
      .single();

    if (error || !link) {
      throw new AppError(400, "INVITATION_FAILED", error?.message ?? "No se pudo generar la invitación");
    }

    await logAuditEvent({
      organizationId: profile.organizationId,
      actorId: profile.id,
      action: AUDIT_ACTIONS.USER_INVITED,
      resourceType: "user",
      resourceId: link.id,
      payloadAfter: { email: link.email, role: link.role, temporaryAccess: body.temporaryAccess },
      ...requestContext(req),
    });

    res.status(201).json({
      data: {
        url: `${env.CORS_ORIGIN}/register?invite=${link.id}`,
        email: link.email,
        role: link.role,
        temporaryAccessDays: body.temporaryAccess ? GUEST_TRIAL_DAYS : null,
        linkExpiresAt: link.expires_at,
      },
    });
  })
);

/**
 * Preview público (sin auth: quien todavía no tiene cuenta no puede
 * autenticarse) para mostrar "te invitaron a unirte a <org> como <rol>"
 * antes de registrarse. No expone nada sensible — solo nombre de
 * organización y rol.
 */
invitationsRouter.get(
  "/invitations/:token",
  validateUuidParams("token"),
  asyncHandler(async (req, res) => {
    const { data: link } = await supabaseAdmin
      .from("invite_links")
      .select("role, email, expires_at, used_at, organizations(name)")
      .eq("id", req.params.token)
      .maybeSingle();

    if (!link) throw new AppError(404, "INVITATION_NOT_FOUND", "El link de invitación no existe");
    if (link.used_at) throw new AppError(410, "INVITATION_ALREADY_USED", "Este link de invitación ya fue usado");
    if (new Date(link.expires_at) <= new Date()) {
      throw new AppError(410, "INVITATION_EXPIRED", "Este link de invitación venció");
    }

    const organization = Array.isArray(link.organizations) ? link.organizations[0] : link.organizations;
    res.status(200).json({
      data: { organizationName: organization?.name ?? null, role: link.role, email: link.email },
    });
  })
);

const acceptInvitationSchema = z.object({
  token: z.string().uuid(),
  fullName: z.string().trim().min(2).max(200),
});

/**
 * Completa la invitación: crea el `profiles` que faltaba, con la
 * organización y el rol que trae `invite_links` — nunca del body, así el
 * cliente no puede autoasignarse una organización u otro rol. `expires_at`
 * del perfil (si es auditor_guest) se calcula ACÁ, al aceptar, no al
 * generar el link: así un link sin usar no le descuenta días de prueba a
 * nadie.
 */
invitationsRouter.post(
  "/onboarding/accept-invitation",
  authenticateTokenOnly,
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const body = acceptInvitationSchema.parse(req.body);

    const { data: existingProfile } = await supabaseAdmin.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (existingProfile) {
      throw new AppError(409, "PROFILE_ALREADY_EXISTS", "Este usuario ya tiene una organización asociada");
    }

    const { data: link } = await supabaseAdmin
      .from("invite_links")
      .select("id, organization_id, role, expires_at, used_at")
      .eq("id", body.token)
      .maybeSingle();

    if (!link) throw new AppError(404, "INVITATION_NOT_FOUND", "El link de invitación no existe");
    if (link.used_at) throw new AppError(410, "INVITATION_ALREADY_USED", "Este link de invitación ya fue usado");
    if (new Date(link.expires_at) <= new Date()) {
      throw new AppError(410, "INVITATION_EXPIRED", "Este link de invitación venció");
    }

    const expiresAt =
      link.role === "auditor_guest" ? new Date(Date.now() + GUEST_TRIAL_DAYS * 86_400_000) : null;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: userId,
        organization_id: link.organization_id,
        role: link.role,
        full_name: body.fullName,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
      })
      .select("id, organization_id, role, expires_at")
      .single();

    if (profileError || !profile) {
      throw new AppError(400, "PROFILE_CREATE_FAILED", profileError?.message ?? "No se pudo crear el perfil");
    }

    await supabaseAdmin.from("invite_links").update({ used_at: new Date().toISOString(), used_by: userId }).eq("id", link.id);

    await logAuditEvent({
      organizationId: link.organization_id,
      actorId: userId,
      action: AUDIT_ACTIONS.INVITATION_ACCEPTED,
      resourceType: "user",
      resourceId: userId,
      payloadAfter: { role: link.role, expiresAt: profile.expires_at },
      ...requestContext(req),
    });

    if (link.role === "auditor_guest") {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
      const { data: org } = await supabaseAdmin.from("organizations").select("name").eq("id", link.organization_id).maybeSingle();
      if (authUser.user?.email) {
        sendGuestEmail(authUser.user.email, {
          kind: "welcome",
          params: { recipientName: body.fullName, organizationName: org?.name ?? "tu organización", appUrl: env.CORS_ORIGIN },
        }).catch((err) => console.error("[invitations] no se pudo enviar el email de bienvenida:", err));
      }
    }

    res.status(201).json({
      data: {
        id: profile.id,
        organizationId: profile.organization_id,
        role: profile.role,
        expiresAt: profile.expires_at,
      },
    });
  })
);
