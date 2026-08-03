import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

export const corsMiddleware = cors({
  origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
  credentials: true,
});

export const helmetMiddleware = helmet();

/** Límite general para toda la API. */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes, intentá de nuevo más tarde" } },
});

/**
 * Límite estricto para operaciones sensibles/costosas: disparar escaneos
 * o subir evidencias. Evita que un tenant abuse del motor de escaneo
 * (ver vacío de seguridad #8 de arquitectura-mvp.md).
 */
export const sensitiveActionRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Límite de operaciones sensibles alcanzado para esta hora" } },
});
