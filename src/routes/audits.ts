import { Router } from "express";
import { z } from "zod";
import { authenticateToken, requireRole } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middlewares/errorHandler.js";
import { supabaseForUser } from "../config/supabase.js";

export const auditsRouter = Router();

const createAuditSchema = z.object({
  title: z.string().trim().min(3).max(200),
  framework: z.enum(["iso27001", "nist_csf", "gdpr", "local_dp_law"]),
});

auditsRouter.use(authenticateToken);

auditsRouter.post(
  "/audits",
  requireRole(["ciso", "auditor"]),
  asyncHandler(async (req, res) => {
    const body = createAuditSchema.parse(req.body);
    const profile = req.profile!;
    const supabase = supabaseForUser(profile.accessToken);

    const { data, error } = await supabase
      .from("audits")
      .insert({
        title: body.title,
        framework: body.framework,
        organization_id: profile.organizationId,
        created_by: profile.id,
      })
      .select()
      .single();

    if (error) {
      throw new AppError(400, "AUDIT_CREATE_FAILED", error.message);
    }

    res.status(201).json({ data });
  })
);

auditsRouter.get(
  "/audits",
  asyncHandler(async (req, res) => {
    const profile = req.profile!;
    const supabase = supabaseForUser(profile.accessToken);

    const { data, error } = await supabase
      .from("audits")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new AppError(400, "AUDIT_LIST_FAILED", error.message);
    }

    res.status(200).json({ data });
  })
);

auditsRouter.get(
  "/audits/:id",
  asyncHandler(async (req, res) => {
    const profile = req.profile!;
    const supabase = supabaseForUser(profile.accessToken);

    const { data, error } = await supabase
      .from("audits")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();

    if (error) {
      throw new AppError(400, "AUDIT_FETCH_FAILED", error.message);
    }
    if (!data) {
      throw new AppError(404, "AUDIT_NOT_FOUND", "Auditoría no encontrada");
    }

    res.status(200).json({ data });
  })
);
