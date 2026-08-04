"use client";

import { useState, type FormEvent } from "react";
import { Check, Copy, UserPlus } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import type { InviteLink } from "@/lib/types";
import { useProfile } from "@/hooks/useProfile";
import { useI18n } from "@/lib/i18n/context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function TeamSettingsPage() {
  const { dict } = useI18n();
  const t = dict.settings.team;
  const { profile, loading: profileLoading } = useProfile();

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [temporaryAccess, setTemporaryAccess] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<InviteLink | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await api.post<{ data: InviteLink }>("/api/v1/invitations", {
        email: email.trim() || undefined,
        temporaryAccess,
      });
      setLink(res.data.data);
      setCopied(false);
    } catch (err) {
      setError(getApiErrorMessage(err, t.inviteFailed));
    } finally {
      setSending(false);
    }
  }

  function handleCopy() {
    if (!link) return;
    navigator.clipboard.writeText(link.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function openDialog() {
    setOpen(true);
    setLink(null);
    setEmail("");
    setTemporaryAccess(true);
    setError(null);
  }

  if (profileLoading) {
    return <Skeleton className="h-48" />;
  }

  if (!profile?.isPlatformAdmin) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t.accessDenied}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <Button onClick={openDialog}>
          <UserPlus className="size-4" aria-hidden />
          {t.invite}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.inviteTitle}</DialogTitle>
          </DialogHeader>

          {link ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{t.linkGeneratedDesc}</p>
              <div className="flex items-center gap-2">
                <Input readOnly value={link.url} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                  {copied ? t.copied : t.copy}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {link.temporaryAccessDays ? t.linkNoteGuest : t.linkNoteAuditor}
              </p>
              <Button type="button" variant="ghost" onClick={openDialog} className="self-start">
                {t.inviteAnother}
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{t.inviteDesc}</p>

              <div className="flex flex-col gap-2">
                <Label htmlFor="email">{t.emailLabel}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t.emailOptionalHint}</p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={temporaryAccess} onCheckedChange={(v) => setTemporaryAccess(v === true)} />
                  {t.temporaryAccessLabel}
                </label>
                <p className="text-xs text-muted-foreground">{t.temporaryAccessHint}</p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={sending} className="self-start">
                {sending ? t.generating : t.generateLink}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
