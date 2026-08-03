import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
if (!email) {
  console.error("Uso: npm run admin:promote -- tu@email.com");
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en tu .env");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  // listUsers pagina; para un proyecto chico alcanza con la primera página.
  // Si tenés muchos usuarios y no aparece, subí perPage o filtrá por página.
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`No se pudo listar usuarios: ${error.message}`);

  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    throw new Error(`No existe ningún usuario de Auth con el email "${email}". ¿Ya te registraste con ese email?`);
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, organization_id, role, is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw new Error(`Error consultando el perfil: ${profileError.message}`);
  if (!profile) {
    throw new Error(
      `El usuario existe pero no tiene un profile todavía (no completó el onboarding). Registrate/logueate primero.`
    );
  }
  if (profile.is_platform_admin) {
    console.log(`"${email}" ya es platform admin. No se hizo ningún cambio.`);
    return;
  }

  const { error: updateError } = await admin.from("profiles").update({ is_platform_admin: true }).eq("id", user.id);
  if (updateError) throw new Error(`No se pudo actualizar el perfil: ${updateError.message}`);

  console.log(`✅ "${email}" ahora es platform admin.`);
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
