import { Router } from "express";
import { z } from "zod";
import { authenticateTokenOnly } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middlewares/errorHandler.js";
import { supabaseAdmin } from "../config/supabase.js";

export const onboardingRouter = Router();

const createOrganizationSchema = z.object({
  organizationName: z.string().trim().min(2).max(200),
  fullName: z.string().trim().min(2).max(200),
});

/**
 * Paso posterior a supabase.auth.signUp() en el frontend: crea la
 * organización y el primer perfil (rol 'ciso', dueño de la cuenta).
 *
 * Usa service_role a propósito: `organizations` y `profiles` no tienen
 * políticas de escritura para el rol `authenticated` (ver migración 003),
 * así que un cliente no puede autoasignarse una organización o un rol —
 * este es el único camino confiable para crear el primer perfil.
 */
onboardingRouter.post(
  "/onboarding/organization",
  authenticateTokenOnly,
  asyncHandler(async (req, res) => {
    const body = createOrganizationSchema.parse(req.body);
    const userId = req.userId!;

    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (existingProfile) {
      throw new AppError(409, "PROFILE_ALREADY_EXISTS", "Este usuario ya tiene una organización asociada");
    }

    const { data: organization, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({ name: body.organizationName })
      .select("id")
      .single();
    if (orgError || !organization) {
      throw new AppError(400, "ORGANIZATION_CREATE_FAILED", orgError?.message ?? "No se pudo crear la organización");
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({ id: userId, organization_id: organization.id, role: "ciso", full_name: body.fullName })
      .select("id, organization_id, role")
      .single();
    if (profileError || !profile) {
      // Revertir la organización huérfana si el perfil no se pudo crear.
      await supabaseAdmin.from("organizations").delete().eq("id", organization.id);
      throw new AppError(400, "PROFILE_CREATE_FAILED", profileError?.message ?? "No se pudo crear el perfil");
    }

    res.status(201).json({
      data: { id: profile.id, organizationId: profile.organization_id, role: profile.role },
    });
  })
);
