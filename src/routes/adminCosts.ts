import { Router } from "express";
import { z } from "zod";
import { authenticateToken, requirePlatformAdmin } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middlewares/errorHandler.js";
import {
  getPlatformCostSummary,
  getCostBreakdown,
  getAuditCosts,
  listPricingConfig,
  updatePricing,
  DEFAULT_PRICING,
} from "../services/costEngine.js";

export const adminCostsRouter = Router();

const dateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

function parseRange(query: unknown) {
  const parsed = dateRangeSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, "INVALID_DATE_RANGE", "Los parámetros from/to deben ser fechas ISO 8601");
  }
  return {
    fromDate: parsed.data.from ? new Date(parsed.data.from) : undefined,
    toDate: parsed.data.to ? new Date(parsed.data.to) : undefined,
  };
}

/** Resumen consolidado de costos de toda la plataforma (KPI cards). */
adminCostsRouter.get(
  "/admin/costs/summary",
  authenticateToken,
  requirePlatformAdmin,
  asyncHandler(async (_req, res) => {
    const data = await getPlatformCostSummary();
    res.status(200).json({ data });
  })
);

/** Serie diaria por servicio (gráfico de área) + costo total por organización. */
adminCostsRouter.get(
  "/admin/costs/breakdown",
  authenticateToken,
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    const { fromDate, toDate } = parseRange(req.query);
    const data = await getCostBreakdown(fromDate, toDate);
    res.status(200).json({ data });
  })
);

/** Tabla de auditorías ordenadas por costo operativo total (mayor a menor). */
adminCostsRouter.get(
  "/admin/costs/audits",
  authenticateToken,
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    const { fromDate, toDate } = parseRange(req.query);
    const limitParsed = z.coerce.number().int().min(1).max(500).default(10).safeParse(req.query.limit);
    if (!limitParsed.success) {
      throw new AppError(400, "INVALID_LIMIT", "El parámetro limit debe ser un entero entre 1 y 500");
    }
    const data = await getAuditCosts(limitParsed.data, fromDate, toDate);
    res.status(200).json({ data });
  })
);

/** Tarifas unitarias actuales (para precargar el modal de edición de precios). */
adminCostsRouter.get(
  "/admin/costs/pricing",
  authenticateToken,
  requirePlatformAdmin,
  asyncHandler(async (_req, res) => {
    const data = await listPricingConfig();
    res.status(200).json({ data, defaults: DEFAULT_PRICING });
  })
);

const updatePricingSchema = z.object({
  updates: z
    .array(
      z.object({
        key: z.string().min(1),
        unit_price: z.number().nonnegative(),
      })
    )
    .min(1),
});

/** Actualiza una o más tarifas unitarias cuando cambian los precios del proveedor. */
adminCostsRouter.patch(
  "/admin/costs/pricing",
  authenticateToken,
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    const body = updatePricingSchema.parse(req.body);
    await updatePricing(body.updates);
    const data = await listPricingConfig();
    res.status(200).json({ data });
  })
);
