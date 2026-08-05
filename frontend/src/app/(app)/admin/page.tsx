"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Building2, CheckCircle2, DollarSign, Globe, ShieldAlert, TrendingUp } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import type { AdminOrganization, PlatformAuditLogEntry, RealKpiReport } from "@/lib/types";
import { useI18n } from "@/lib/i18n/context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

const clpFormatter = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const pctFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });

function formatClp(value: number): string {
  return clpFormatter.format(value);
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Building2;
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold whitespace-nowrap">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminOverviewPage() {
  const { dict } = useI18n();
  const t = dict.admin.overview;

  const [kpis, setKpis] = useState<RealKpiReport | null>(null);
  const [orgs, setOrgs] = useState<AdminOrganization[]>([]);
  const [blockedAttempts, setBlockedAttempts] = useState<PlatformAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<{ data: RealKpiReport }>("/api/v1/admin/kpis/real-metrics?period=current_month"),
      api.get<{ data: AdminOrganization[] }>("/api/v1/admin/organizations"),
      api.get<{ data: PlatformAuditLogEntry[] }>("/api/v1/admin/audit-logs?action=UNAUTHORIZED_SCAN_BLOCKED&limit=5"),
    ])
      .then(([kpiRes, orgsRes, logsRes]) => {
        setKpis(kpiRes.data.data);
        setOrgs(orgsRes.data.data);
        setBlockedAttempts(logsRes.data.data);
      })
      .catch((err) => setError(getApiErrorMessage(err, t.loadFailed)))
      .finally(() => setLoading(false));
  }, [t.loadFailed]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (error || !kpis) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error ?? t.loadFailed}</AlertDescription>
      </Alert>
    );
  }

  const suspendedOrgs = orgs.filter((o) => o.is_suspended);
  const pendingDomains = orgs.reduce((sum, o) => sum + (o.domainStats.total - o.domainStats.verified), 0);
  const hasAlerts = suspendedOrgs.length > 0 || pendingDomains > 0 || blockedAttempts.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Building2} label={t.kpiTotalOrgs} value={kpis.funnel.totalOrganizations} />
        <StatCard
          icon={Globe}
          label={t.kpiDomains}
          value={`${kpis.operational.verifiedDomainAssets} / ${kpis.operational.totalDomainAssets}`}
          sub={
            kpis.operational.domainVerificationRatePct !== null
              ? `${pctFormatter.format(kpis.operational.domainVerificationRatePct)}% ${t.verified}`
              : undefined
          }
        />
        <StatCard icon={DollarSign} label={t.kpiMrr} value={formatClp(kpis.financial.mrrRealClp)} />
        <StatCard icon={TrendingUp} label={t.kpiAudits} value={kpis.operational.auditsCompleted} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t.activityChartTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={kpis.dailyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" minTickGap={24} />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={30} allowDecimals={false} />
                <Tooltip
                  formatter={(value, key) => [value, key === "scansCompleted" ? t.seriesScans : t.seriesCriticalFindings]}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }}
                />
                <Legend
                  formatter={(key: string) => (key === "scansCompleted" ? t.seriesScans : t.seriesCriticalFindings)}
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Line type="monotone" dataKey="scansCompleted" stroke="var(--finops-revenue)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="criticalFindings" stroke="var(--finops-costs)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.alertsTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {!hasAlerts ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-[var(--severity-low)]" aria-hidden />
                {t.noAlerts}
              </p>
            ) : (
              <ul className="flex flex-col gap-3 text-sm">
                {suspendedOrgs.length > 0 && (
                  <li className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[var(--severity-high)]" aria-hidden />
                    <span>
                      <Link href="/admin/organizations" className="font-medium underline-offset-2 hover:underline">
                        {t.alertSuspendedOrgs.replace("{count}", String(suspendedOrgs.length))}
                      </Link>
                    </span>
                  </li>
                )}
                {pendingDomains > 0 && (
                  <li className="flex items-start gap-2">
                    <Globe className="mt-0.5 size-4 shrink-0 text-[var(--severity-medium)]" aria-hidden />
                    <span>
                      <Link href="/admin/organizations" className="font-medium underline-offset-2 hover:underline">
                        {t.alertPendingDomains.replace("{count}", String(pendingDomains))}
                      </Link>
                    </span>
                  </li>
                )}
                {blockedAttempts.length > 0 && (
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--severity-critical)]" aria-hidden />
                    <span>
                      <Link href="/admin/audit-logs" className="font-medium underline-offset-2 hover:underline">
                        {t.alertBlockedScans.replace("{count}", String(blockedAttempts.length))}
                      </Link>
                    </span>
                  </li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
