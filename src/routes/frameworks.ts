import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getRequirementsForFramework } from "../data/complianceRequirements.js";

export const frameworksRouter = Router();

/** Catálogo de requisitos de un framework, para el selector de evidencias del frontend. */
frameworksRouter.get(
  "/frameworks/:framework/requirements",
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.status(200).json({ data: getRequirementsForFramework(String(req.params.framework)) });
  })
);
