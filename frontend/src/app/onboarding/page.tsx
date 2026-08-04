"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import type { InvitationPreview } from "@/lib/types";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { LanguageSwitcher } from "@/components/language-switcher";

/**
 * Paso final del registro para quienes confirmaron su email y ya tienen
 * sesión de Supabase, pero todavía no tienen `profiles` (ver /register).
 *
 * También es el destino de quienes se registraron desde un link de
 * invitación (ver /settings/team y /register?invite=<token>): el token
 * queda en `user_metadata.invite_token` desde el signUp — acá se resuelve
 * contra `GET /invitations/:token` para mostrar a qué organización/rol se
 * están uniendo, y `POST /onboarding/accept-invitation` es quien valida el
 * token del lado del servidor (nunca se confía en el rol/organización que
 * pueda decir el propio metadata del cliente).
 */
export default function OnboardingPage() {
  const router = useRouter();
  const { dict } = useI18n();
  const t = dict.auth.onboarding;

  const [checkingInvite, setCheckingInvite] = useState(true);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [invitePreview, setInvitePreview] = useState<InvitationPreview | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [organizationName, setOrganizationName] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getUser()
      .then(async ({ data }) => {
        if (cancelled) return;
        const metadata = data.user?.user_metadata as Record<string, unknown> | undefined;
        const token = typeof metadata?.invite_token === "string" ? metadata.invite_token : null;
        if (!token) {
          setCheckingInvite(false);
          return;
        }
        setInviteToken(token);
        try {
          const res = await api.get<{ data: InvitationPreview }>(`/api/v1/invitations/${token}`);
          if (!cancelled) setInvitePreview(res.data.data);
        } catch (err) {
          if (!cancelled) setInviteError(getApiErrorMessage(err, t.invalidInvite));
        } finally {
          if (!cancelled) setCheckingInvite(false);
        }
      })
      .catch(() => {
        if (!cancelled) setCheckingInvite(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const invited = Boolean(inviteToken && invitePreview && !inviteError);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (invited && inviteToken) {
        await api.post("/api/v1/onboarding/accept-invitation", { token: inviteToken, fullName });
      } else {
        await api.post("/api/v1/onboarding/organization", { organizationName, fullName });
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(getApiErrorMessage(err, invited ? t.acceptInvitationFailed : t.createOrgFailed));
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
          <CardTitle>{invited ? t.invitedTitle : t.title}</CardTitle>
          <CardDescription>{invited ? t.invitedSubtitle : t.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          {checkingInvite ? (
            <Skeleton className="h-32" />
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {inviteError && (
                <Alert variant="destructive">
                  <AlertDescription>{inviteError}</AlertDescription>
                </Alert>
              )}

              {invited && invitePreview && (
                <Alert>
                  <AlertDescription>
                    {invitePreview.role === "auditor_guest" ? t.invitedRoleGuest : t.invitedRoleAuditor}
                  </AlertDescription>
                </Alert>
              )}

              {!invited && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="organizationName">{t.organizationName}</Label>
                  <Input
                    id="organizationName"
                    required
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                  />
                </div>
              )}
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
                {loading ? (invited ? t.accepting : t.submitting) : invited ? t.acceptInvitation : t.submit}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
