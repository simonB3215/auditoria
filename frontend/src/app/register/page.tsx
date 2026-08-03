"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { api, getApiErrorMessage } from "@/lib/api";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GoogleSignInButton } from "@/components/google-signin-button";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function RegisterPage() {
  const router = useRouter();
  const { dict } = useI18n();
  const t = dict.auth.register;
  const [organizationName, setOrganizationName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    if (!signUpData.session) {
      // El proyecto Supabase exige confirmar el email antes de emitir sesión.
      setLoading(false);
      setNeedsEmailConfirmation(true);
      return;
    }

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

  if (needsEmailConfirmation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <div className="absolute right-4 top-4">
          <LanguageSwitcher />
        </div>
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center text-center">
            <ShieldCheck className="mb-2 size-8 text-primary" aria-hidden />
            <CardTitle>{t.confirmEmailTitle}</CardTitle>
            <CardDescription>
              {t.confirmEmailDescBefore} <span className="font-medium">{email}</span>. {t.confirmEmailDescAfter}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/login">{t.goToLogin}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{t.email}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{t.password}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
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

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            {dict.common.or}
            <div className="h-px flex-1 bg-border" />
          </div>

          <GoogleSignInButton />
          <p className="mt-2 text-center text-xs text-muted-foreground">{t.googleHint}</p>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t.hasAccount}{" "}
            <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              {t.loginLink}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
