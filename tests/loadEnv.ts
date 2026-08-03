import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Los tests de integración crean/borran usuarios y organizaciones reales.
// Se usa .env.test (proyecto Supabase DEDICADO a testing) si existe, para
// no correr esto nunca contra el .env de desarrollo/producción por error.
const testEnvPath = resolve(process.cwd(), ".env.test");

if (existsSync(testEnvPath)) {
  config({ path: testEnvPath });
} else {
  console.warn(
    "[tests] No se encontró .env.test — usando .env. " +
      "Se recomienda un proyecto Supabase separado exclusivo para tests (ver .env.test.example)."
  );
  config();
}
