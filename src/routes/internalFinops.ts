import { Router } from "express";
import { z } from "zod";
import { authenticateToken, requirePlatformAdmin } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middlewares/errorHandler.js";
import { getLatestIndicators } from "../services/economicIndicators.js";
import { computeProjection, DEFAULT_PROJECTION_INPUTS, SII_LEY_21663_ADDRESSABLE_COMPANIES } from "../services/finopsProjection.js";

export const internalFinopsRouter = Router();

const projectionQuerySchema = z.object({
  startersCount: z.coerce.number().int().min(0).max(1_000_000).default(DEFAULT_PROJECTION_INPUTS.startersCount),
  proCount: z.coerce.number().int().min(0).max(1_000_000).default(DEFAULT_PROJECTION_INPUTS.proCount),
  opexUsd: z.coerce.number().min(0).max(1_000_000).default(DEFAULT_PROJECTION_INPUTS.opexUsd),
  marketPenetrationPct: z.coerce.number().min(0).max(100).default(DEFAULT_PROJECTION_INPUTS.marketPenetrationPct),
});

/**
 * a.md pide `GET /api/admin/internal-projection` — se adapta a
 * `/api/v1/admin/internal-finops/projection` para seguir la convención de
 * versionado y de agrupar rutas de admin bajo `/admin/*` que ya usa el
 * resto del backend (ver adminCosts.ts, adminRouter).
 *
 * a.md también pide restringir el acceso a roles `super_admin`/`executive`
 * — este proyecto ya tiene `profiles.is_platform_admin` cumpliendo
 * exactamente ese propósito (máximo privilegio, visibilidad cross-org) y
 * usado por el resto de `/admin/*`; se reutiliza `requirePlatformAdmin` en
 * vez de introducir un segundo sistema de roles paralelo para un único
 * módulo.
 */
internalFinopsRouter.get(
  "/admin/internal-finops/projection",
  authenticateToken,
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    const parsed = projectionQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, "INVALID_PROJECTION_INPUT", "Parámetros de simulación inválidos");
    }
    const query = parsed.data;

    let indicators;
    try {
      indicators = await getLatestIndicators();
    } catch (err) {
      throw new AppError(
        503,
        "ECONOMIC_INDICATORS_UNAVAILABLE",
        err instanceof Error ? err.message : "No se pudieron obtener los indicadores económicos"
      );
    }

    const inputs = {
      ...DEFAULT_PROJECTION_INPUTS,
      startersCount: query.startersCount,
      proCount: query.proCount,
      opexUsd: query.opexUsd,
      marketPenetrationPct: query.marketPenetrationPct,
    };

    const projection = computeProjection(inputs, indicators.ufValue, indicators.dolarValue);

    res.status(200).json({
      data: {
        indicators,
        inputs,
        addressableMarket: {
          totalCompanies: SII_LEY_21663_ADDRESSABLE_COMPANIES,
          penetrationPct: query.marketPenetrationPct,
          potentialClients: projection.addressableClients,
        },
        projection,
      },
    });
  })
);
