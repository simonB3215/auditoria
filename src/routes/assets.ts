import { Router } from "express";
import { resolveTxt } from "node:dns/promises";
import { authenticateToken, requireRole } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middlewares/errorHandler.js";
import { supabaseForUser } from "../config/supabase.js";
import { assetInputSchema } from "../validators/assetValidators.js";
import { validateUuidParams } from "../middlewares/validateParams.js";

export const assetsRouter = Router();

assetsRouter.post(
  "/assets",
  authenticateToken,
  requireRole(["ciso", "auditor"]),
  asyncHandler(async (req, res) => {
    const body = assetInputSchema.parse(req.body);
    const profile = req.profile!;
    const supabase = supabaseForUser(profile.accessToken);

    const { data, error } = await supabase
      .from("assets")
      .insert({
        type: body.type,
        value: body.value,
        criticality: body.criticality,
        tags: body.tags,
        organization_id: profile.organizationId,
        created_by: profile.id,
      })
      .select("id, type, value, criticality, tags, verification_status, created_at")
      .single();

    if (error) {
      // unique(organization_id, type, value)
      if (error.code === "23505") {
        throw new AppError(409, "ASSET_ALREADY_EXISTS", "Este activo ya está registrado en tu organización");
      }
      throw new AppError(400, "ASSET_CREATE_FAILED", error.message);
    }

    res.status(201).json({ data });
  })
);

assetsRouter.get(
  "/assets",
  authenticateToken,
  asyncHandler(async (req, res) => {
    const profile = req.profile!;
    const supabase = supabaseForUser(profile.accessToken);

    let query = supabase
      .from("assets")
      .select("id, type, value, criticality, tags, verification_status, verified_at, created_at")
      .order("created_at", { ascending: false });

    const { type, criticality, tag } = req.query;
    if (typeof type === "string") query = query.eq("type", type);
    if (typeof criticality === "string") query = query.eq("criticality", criticality);
    if (typeof tag === "string") query = query.contains("tags", [tag]);

    const { data, error } = await query;

    if (error) {
      throw new AppError(400, "ASSET_LIST_FAILED", error.message);
    }

    res.status(200).json({ data });
  })
);

assetsRouter.get(
  "/assets/:id",
  authenticateToken,
  validateUuidParams("id"),
  asyncHandler(async (req, res) => {
    const profile = req.profile!;
    const supabase = supabaseForUser(profile.accessToken);

    const { data, error } = await supabase
      .from("assets")
      .select("id, type, value, criticality, tags, verification_status, verified_at, created_at")
      .eq("id", req.params.id)
      .maybeSingle();

    if (error) {
      throw new AppError(400, "ASSET_FETCH_FAILED", error.message);
    }
    // RLS hace que un activo de otra organización simplemente no aparezca
    // en el resultado: se responde 404 tanto si no existe como si es ajeno,
    // sin filtrar esa distinción entre tenants.
    if (!data) {
      throw new AppError(404, "ASSET_NOT_FOUND", "Activo no encontrado");
    }

    res.status(200).json({ data });
  })
);

assetsRouter.delete(
  "/assets/:id",
  authenticateToken,
  requireRole(["ciso", "auditor"]),
  validateUuidParams("id"),
  asyncHandler(async (req, res) => {
    const supabase = supabaseForUser(req.profile!.accessToken);

    const { error, count } = await supabase.from("assets").delete({ count: "exact" }).eq("id", req.params.id);
    if (error) {
      throw new AppError(400, "ASSET_DELETE_FAILED", error.message);
    }
    if (!count) {
      throw new AppError(404, "ASSET_NOT_FOUND", "Activo no encontrado");
    }

    res.status(204).send();
  })
);

/**
 * Verificación de propiedad. Requisito previo para poder incluir el activo
 * en un escaneo activo (ver POST /audits/:id/run-scan).
 *
 * - domain: se exige un registro DNS TXT en `_aegis-verification.<dominio>`
 *   con el valor `aegis-verify=<verification_token>`.
 * - ip / cidr: no existe un mecanismo DNS equivalente sencillo para el MVP;
 *   se acepta la autoatestación de un rol `ciso` (dueño de la cuenta de la
 *   organización). Limitación conocida: no prueba criptográficamente la
 *   titularidad del rango — a mejorar en una iteración futura (ej. RDAP/WHOIS
 *   cruzado contra el dominio corporativo verificado).
 */
assetsRouter.post(
  "/assets/:id/verify",
  authenticateToken,
  requireRole(["ciso", "auditor"]),
  validateUuidParams("id"),
  asyncHandler(async (req, res) => {
    const profile = req.profile!;
    const supabase = supabaseForUser(profile.accessToken);

    const { data: asset, error: fetchError } = await supabase
      .from("assets")
      .select("id, type, value, verification_token, verification_status")
      .eq("id", req.params.id)
      .maybeSingle();

    if (fetchError) {
      throw new AppError(400, "ASSET_FETCH_FAILED", fetchError.message);
    }
    if (!asset) {
      throw new AppError(404, "ASSET_NOT_FOUND", "Activo no encontrado");
    }
    if (asset.verification_status === "verified") {
      res.status(200).json({ data: asset });
      return;
    }

    if (asset.type === "domain") {
      const expected = `aegis-verify=${asset.verification_token}`;
      let records: string[][] = [];
      try {
        records = await resolveTxt(`_aegis-verification.${asset.value}`);
      } catch {
        throw new AppError(
          422,
          "DNS_RECORD_NOT_FOUND",
          `No se encontró el registro TXT en _aegis-verification.${asset.value}. Esperado: "${expected}"`
        );
      }
      const found = records.some((chunks) => chunks.join("").trim() === expected);
      if (!found) {
        throw new AppError(
          422,
          "DNS_RECORD_MISMATCH",
          `El registro TXT encontrado no coincide con el token esperado ("${expected}")`
        );
      }
    } else if (profile.role !== "ciso") {
      throw new AppError(
        403,
        "VERIFICATION_REQUIRES_CISO",
        "La verificación de activos IP/CIDR requiere el rol 'ciso'"
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("assets")
      .update({ verification_status: "verified", verified_at: new Date().toISOString() })
      .eq("id", asset.id)
      .select("id, type, value, verification_status, verified_at")
      .single();

    if (updateError) {
      throw new AppError(400, "ASSET_VERIFY_FAILED", updateError.message);
    }

    res.status(200).json({ data: updated });
  })
);
