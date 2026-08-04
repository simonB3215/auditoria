"use client";

import { useEffect, useState } from "react";
import { Database, ShieldCheck, Trash2 } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import type { RetentionSettings } from "@/lib/types";
import { useProfile } from "@/hooks/useProfile";
import { useI18n } from "@/lib/i18n/context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

function StatCard({ icon: Icon, label, value }: { icon: typeof Database; label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RetentionSettingsPage() {
  const { dict } = useI18n();
  const t = dict.settings.retention;
  const { profile, loading: profileLoading } = useProfile();

  const [settings, setSettings] = useState<RetentionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [disabled, setDisabled] = useState(false);
  const [days, setDays] = useState("90");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [runningNow, setRunningNow] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api
      .get<{ data: RetentionSettings }>("/api/v1/settings/retention")
      .then((res) => {
        setSettings(res.data.data);
        setDisabled(res.data.data.retentionPeriodDays === null);
        setDays(res.data.data.retentionPeriodDays ? String(res.data.data.retentionPeriodDays) : "90");
      })
      .catch((err) => setError(getApiErrorMessage(err, t.loadFailed)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (profile) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const canEdit = profile?.role === "ciso" || profile?.isPlatformAdmin;

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const retentionPeriodDays = disabled ? null : Number(days);
      await api.patch("/api/v1/settings/retention", { retentionPeriodDays });
      load();
    } catch (err) {
      setSaveError(getApiErrorMessage(err, t.updateFailed));
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    setRunningNow(true);
    setRunResult(null);
    try {
      const res = await api.post<{ data: { evidencesPurged: number } }>("/api/v1/admin/retention/run-now");
      setRunResult(`${t.runNowResult}: ${res.data.data.evidencesPurged}`);
      load();
    } catch (err) {
      setRunResult(getApiErrorMessage(err, t.runNowFailed));
    } finally {
      setRunningNow(false);
    }
  }

  if (profileLoading) {
    return <Skeleton className="h-48" />;
  }

  if (!canEdit) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t.accessDenied}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : error || !settings ? (
        <Alert variant="destructive">
          <AlertDescription>{error ?? t.loadFailed}</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard icon={Database} label={t.totalEvidences} value={settings.totalEvidences} />
            <StatCard icon={ShieldCheck} label={t.purgedEvidences} value={settings.purgedEvidences} />
            <StatCard icon={Trash2} label={t.eligibleForPurge} value={settings.eligibleForPurge} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.currentPolicy}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={disabled} onCheckedChange={(v) => setDisabled(v === true)} />
                {t.disablePolicy}
              </label>

              {!disabled && (
                <div className="flex flex-col gap-2 max-w-xs">
                  <Label htmlFor="days">{t.daysLabel}</Label>
                  <Input
                    id="days"
                    type="number"
                    min={1}
                    max={3650}
                    placeholder={t.daysPlaceholder}
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                  />
                </div>
              )}

              {saveError && (
                <Alert variant="destructive">
                  <AlertDescription>{saveError}</AlertDescription>
                </Alert>
              )}

              <Button onClick={handleSave} disabled={saving} className="self-start">
                {saving ? t.saving : t.save}
              </Button>

              <p className="text-xs text-muted-foreground">{t.gdprNote}</p>
            </CardContent>
          </Card>

          {profile?.isPlatformAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.runNow}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Button variant="outline" onClick={handleRunNow} disabled={runningNow} className="self-start">
                  {runningNow ? t.runningNow : t.runNow}
                </Button>
                {runResult && <p className="text-sm text-muted-foreground">{runResult}</p>}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
