import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "Falta DATABASE_URL en tu .env.\n" +
      "Buscala en Supabase: Project Settings > Database > Connection string > URI\n" +
      '(usá la conexión directa, no la del pooler, y reemplazá "[YOUR-PASSWORD]" por tu password real).'
  );
  process.exit(1);
}

const files = [
  join(__dirname, "schema.sql"),
  ...readdirSync(join(__dirname, "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(__dirname, "migrations", f)),
];

async function main() {
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log(`Conectado a la base. Voy a ejecutar ${files.length} archivo(s) en orden:`);
  files.forEach((f) => console.log(`  - ${f.replace(__dirname, "db")}`));

  for (const file of files) {
    const sql = readFileSync(file, "utf8");
    process.stdout.write(`\n>>> ${file.replace(__dirname, "db")} ... `);
    try {
      await client.query(sql);
      console.log("OK");
    } catch (err) {
      console.log("FALLÓ");
      console.error(err instanceof Error ? err.message : err);
      console.error(
        "\nSi el error es 'relation already exists' o similar, es porque este script ya se corrió antes " +
          "(schema.sql y las migraciones no son idempotentes: están pensadas para correr una sola vez)."
      );
      await client.end();
      process.exit(1);
    }
  }

  console.log("\nListo — esquema y migraciones aplicados.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
