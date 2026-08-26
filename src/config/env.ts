import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CORS_ORIGIN: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  // Publishable key (sb_publishable_...) o, en proyectos viejos, la anon key legacy.
  SUPABASE_ANON_KEY: z.string().min(1),
  // Secret key (sb_secret_...) o, en proyectos viejos, la service_role key legacy.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  REDIS_URL: z.string().min(1),
  EVIDENCE_BUCKET: z.string().default("evidences"),
  REPORTS_BUCKET: z.string().default("reports"),
  // Límite duro de activos por organización (plan MVP). Configurable sin
  // tocar la lógica de negocio; el valor por defecto no cambió (Fase de
  // auditoría pre-venta, a.md sección 2.2).
  MAX_ASSETS_PER_ORG: z.coerce.number().int().positive().default(5),
  // Clave AES-256 (32 bytes) en hex, para cifrar evidencias antes de subirlas a Storage.
  EVIDENCE_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "Debe ser una clave hexadecimal de 64 caracteres (32 bytes)"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variables de entorno inválidas:", parsed.error.flatten().fieldErrors);
  throw new Error("Configuración de entorno inválida. Revisa tu archivo .env contra .env.example");
}

export const env = parsed.data;
