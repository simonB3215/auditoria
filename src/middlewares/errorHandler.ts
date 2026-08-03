import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` },
  });
}

// Express solo reconoce un middleware como error handler si tiene 4 parámetros,
// por eso _req y _next se mantienen aunque no se usen.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    return;
  }

  // Los `schema.parse(req.body)` de las rutas tiran ZodError directamente:
  // es un error del cliente (400), no un fallo interno del servidor (500).
  if (err instanceof ZodError) {
    const detail = err.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: `Datos inválidos: ${detail}` },
    });
    return;
  }

  console.error("Error no controlado:", err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Ocurrió un error interno inesperado" },
  });
}
