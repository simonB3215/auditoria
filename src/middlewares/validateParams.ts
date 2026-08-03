import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

const uuidSchema = z.string().uuid();

/**
 * Sanitiza params de ruta que deben ser UUID (auditId, assetId, id, ...)
 * antes de que lleguen a cualquier query. Evita pasar valores arbitrarios
 * del usuario directamente a Supabase y da un 400 claro en vez de un error
 * genérico de base de datos.
 */
export function validateUuidParams(...paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const name of paramNames) {
      const value = req.params[name];
      if (!uuidSchema.safeParse(value).success) {
        res.status(400).json({
          error: { code: "INVALID_PARAM", message: `El parámetro '${name}' debe ser un UUID válido` },
        });
        return;
      }
    }
    next();
  };
}
