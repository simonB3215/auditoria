import { Router } from "express";
import { z } from "zod";
import { authenticateToken, requirePlatformAdmin } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middlewares/errorHandler.js";
import { getRealKpiReport } from "../services/realKpiService.js";

export const adminKpisRouter = Router();

const periodSchema = z.enum(["current_month", "last_quarter", "year_to_date"]);

/**
 * a.md pide `GET /api/v1/admin/kpis/real-metrics` restringido a
 * `is_platform_admin` — coincide literalmente con la convención ya usada
 * por `/admin/costs/*` e `/admin/internal-finops/*`, así que no hace falta
 * ninguna adaptación de ruta acá (a diferencia del panel de simulación
 * FinOps, donde sí se adaptó la ruta pedida originalmente).
 */
adminKpisRouter.get(
  "/admin/kpis/real-metrics",
  authenticateToken,
  requirePlatformAdmin,
  asyncHandler(async (req, res) => {
    const parsed = periodSchema.safeParse(req.query.period ?? "current_month");
    if (!parsed.success) {
      throw new AppError(
        400,
        "INVALID_PERIOD",
        "El parámetro period debe ser current_month, last_quarter o year_to_date"
      );
    }
    const data = await getRealKpiReport(parsed.data);
    res.status(200).json({ data });
  })
);
