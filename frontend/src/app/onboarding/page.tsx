"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LanguageSwitcher } from "@/components/language-switcher";

/**
 * Paso final del registro para quienes confirmaron su email y ya tienen
 * sesión de Supabase, pero todavía no tienen `profiles` (ver /register).
 * También es el destino de cuentas viejas que se crearon en Auth pero
 * nunca terminaron este paso — para esas, la pantalla se sentía como "me
 * pide registrarme de nuevo" sin dejar claro que la cuenta ya existía
 * (a.md, "FIX DE ROL ADMIN Y REDIRECCIÓN DE ONBOARDING"), así que se
 * muestra el email de la sesión activa y la opción de cerrarla.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { dict } = useI18n();
  const t = dict.auth.onboarding;

  const [organizationName, setOrganizationName] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setSessionEmail(data.user?.email ?? null));
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await api.post("/api/v1/onboarding/organization", { organizationName, fullName });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, t.createOrgFailed));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <ShieldCheck className="mb-2 size-8 text-primary" aria-hidden />
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{t.subtitle}</CardDescription>
          {sessionEmail && (
            <div className="mt-1 flex flex-col items-center gap-1">
              <p className="text-xs text-muted-foreground">
                {t.loggedInAs.replace("{email}", sessionEmail)}
              </p>
              <p className="text-xs font-medium text-muted-foreground">{t.notNewAccount}</p>
              <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={handleLogout}>
                <LogOut className="size-3" aria-hidden />
                {t.notYouLogout}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="organizationName">{t.organizationName}</Label>
              <Input
                id="organizationName"
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="fullName">{t.fullName}</Label>
              <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? t.submitting : t.submit}
            </Button>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">{t.modulesNote}</p>
        </CardContent>
      </Card>
    </div>
  );
}
