"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, DollarSign, Layers, Settings2, TrendingUp, Trophy } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import type {
  AuditCostRow,
  CostBreakdown,
  CostCategoryKey,
  CostSummary,
  PricingConfigRow,
} from "@/lib/types";
import { useProfile } from "@/hooks/useProfile";
import { useI18n } from "@/lib/i18n/context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CATEGORY_ORDER: CostCategoryKey[] = [
  "supabase_db",
  "supabase_storage",
  "redis_workers",
  "scan_engine",
  "pdf_engine",
  "hosting",
];

const CATEGORY_COLOR: Record<CostCategoryKey, string> = {
  supabase_db: "var(--cost-supabase-db)",
  supabase_storage: "var(--cost-supabase-storage)",
  redis_workers: "var(--cost-redis-workers)",
  scan_engine: "var(--cost-scan-engine)",
  pdf_engine: "var(--cost-pdf-engine)",
  hosting: "var(--cost-hosting)",
};

const clpFormatter = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const creditsFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });

function formatClp(value: number): string {
  return clpFormatter.format(value);
}

function formatCredits(value: number): string {
  return creditsFormatter.format(value);
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  compact,
}: {
  icon: typeof DollarSign;
  label: string;
  value: React.ReactNode;
  sub?: string;
  compact?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p
            className={`truncate font-semibold tabular-nums ${compact ? "text-lg" : "text-2xl"}`}
            title={typeof value === "string" ? value : undefined}
          >
            {value}
          </p>
          {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminCostsPage() {
  const { dict } = useI18n();
  const t = dict.admin.costs;
  const { profile, loading: profileLoading } = useProfile();

  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [breakdown, setBreakdown] = useState<CostBreakdown | null>(null);
  const [audits, setAudits] = useState<AuditCostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState<CostCategoryKey | "all">("all");

  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricingRows, setPricingRows] = useState<PricingConfigRow[]>([]);
  const [pricingDrafts, setPricingDrafts] = useState<Record<string, string>>({});
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);

  function loadAll(from?: string, to?: string) {
    setLoading(true);
    setError(null);
    const rangeParams = new URLSearchParams();
    if (from) rangeParams.set("from", new Date(from).toISOString());
    if (to) rangeParams.set("to", new Date(to).toISOString());
    const qs = rangeParams.toString();

    Promise.all([
      api.get<{ data: CostSummary }>("/api/v1/admin/costs/summary"),
      api.get<{ data: CostBreakdown }>(`/api/v1/admin/costs/breakdown${qs ? `?${qs}` : ""}`),
      api.get<{ data: AuditCostRow[] }>(`/api/v1/admin/costs/audits?limit=100${qs ? `&${qs}` : ""}`),
    ])
      .then(([summaryRes, breakdownRes, auditsRes]) => {
        setSummary(summaryRes.data.data);
        setBreakdown(breakdownRes.data.data);
        setAudits(auditsRes.data.data);
      })
      .catch((err) => setError(getApiErrorMessage(err, t.loadFailed)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (profile?.isPlatformAdmin) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.isPlatformAdmin]);

  function openPricing() {
    setPricingOpen(true);
    setPricingLoading(true);
    setPricingError(null);
    api
      .get<{ data: PricingConfigRow[] }>("/api/v1/admin/costs/pricing")
      .then((res) => {
        setPricingRows(res.data.data);
        setPricingDrafts(Object.fromEntries(res.data.data.map((r) => [r.key, String(r.unit_price)])));
      })
      .catch((err) => setPricingError(getApiErrorMessage(err, t.loadFailed)))
      .finally(() => setPricingLoading(false));
  }

  async function savePricing() {
    setPricingSaving(true);
    setPricingError(null);
    try {
      const updates = pricingRows
        .map((row) => ({ key: row.key, unit_price: Number(pricingDrafts[row.key]) }))
        .filter((u) => Number.isFinite(u.unit_price) && u.unit_price >= 0);
      await api.patch("/api/v1/admin/costs/pricing", { updates });
      setPricingOpen(false);
      loadAll(fromFilter, toFilter);
    } catch (err) {
      setPricingError(getApiErrorMessage(err, t.pricingUpdateFailed));
    } finally {
      setPricingSaving(false);
    }
  }

  if (profileLoading) {
    return <Skeleton className="h-48" />;
  }

  if (!profile?.isPlatformAdmin) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{dict.admin.accessDenied}</AlertDescription>
      </Alert>
    );
  }

  const topService = summary?.byService.reduce(
    (top, s) => (!top || s.costClp > top.costClp ? s : top),
    summary?.byService[0]
  );

  const filteredAudits = audits.filter(
    (a) => providerFilter === "all" || a.breakdown[providerFilter] > 0
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openPricing}>
            <Settings2 className="size-3.5" aria-hidden />
            {t.editPricing}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin">
              <ArrowLeft className="size-3.5" aria-hidden />
              {t.backToAdmin}
            </Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : error || !summary || !breakdown ? (
        <Alert variant="destructive">
          <AlertDescription>{error ?? t.loadFailed}</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              icon={DollarSign}
              label={t.kpiTotalCost}
              value={formatClp(summary.totalMonthlyCostClp)}
              sub={`${formatCredits(summary.totalMonthlyCostCredits)} ${t.creditsUnit}`}
            />
            <StatCard
              icon={TrendingUp}
              label={t.kpiAvgPerAudit}
              value={formatClp(summary.averageCostPerAuditClp)}
              sub={`${formatCredits(summary.averageCostPerAuditCredits)} ${t.creditsUnit}`}
            />
            <StatCard
              icon={Trophy}
              label={t.kpiTopTenant}
              value={summary.topSpendingOrg ? formatClp(summary.topSpendingOrg.costClp) : "—"}
              sub={
                summary.topSpendingOrg
                  ? `${summary.topSpendingOrg.name} · ${formatCredits(summary.topSpendingOrg.costCredits)} ${t.creditsUnit}`
                  : undefined
              }
            />
            <StatCard
              icon={Layers}
              label={t.kpiDistribution}
              value={topService ? (t as Record<string, string>)[`service_${topService.key}`] : "—"}
              sub={topService ? `${topService.percentage.toFixed(1)}%` : undefined}
              compact
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">{t.trendTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                {breakdown.series.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.noAudits}</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={breakdown.series}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                      <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={70} />
                      <Tooltip
                        formatter={(value, key, item) => {
                          const total = Number(value);
                          const totalPoint = item.payload as { total?: number; totalCredits?: number };
                          const credits =
                            totalPoint.total && totalPoint.totalCredits
                              ? (total / totalPoint.total) * totalPoint.totalCredits
                              : 0;
                          return [
                            `${formatClp(total)} (${formatCredits(credits)} ${t.creditsUnit})`,
                            (t as Record<string, string>)[`service_${key}`] ?? String(key),
                          ];
                        }}
                        contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }}
                      />
                      <Legend
                        formatter={(key: string) => (t as Record<string, string>)[`service_${key}`] ?? key}
                        wrapperStyle={{ fontSize: 12 }}
                      />
                      {CATEGORY_ORDER.map((key) => (
                        <Area
                          key={key}
                          type="monotone"
                          dataKey={key}
                          stackId="1"
                          stroke={CATEGORY_COLOR[key]}
                          fill={CATEGORY_COLOR[key]}
                          fillOpacity={0.75}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.distributionTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={summary.byService}
                      dataKey="costClp"
                      nameKey="key"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {summary.byService.map((s) => (
                        <Cell key={s.key} fill={CATEGORY_COLOR[s.key]} stroke="var(--card)" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, _name, item) => {
                        const credits = (item.payload as { costCredits?: number }).costCredits ?? 0;
                        return [
                          `${formatClp(Number(value))} (${formatCredits(credits)} ${t.creditsUnit})`,
                          (t as Record<string, string>)[`service_${item.payload.key}`] ?? item.payload.key,
                        ];
                      }}
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }}
                    />
                    <Legend
                      formatter={(_v, entry) => {
                        const key = (entry.payload as { key: CostCategoryKey } | undefined)?.key;
                        return key ? (t as Record<string, string>)[`service_${key}`] ?? key : "";
                      }}
                      wrapperStyle={{ fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.topAuditsTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              {audits.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.noAudits}</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(200, Math.min(10, audits.length) * 40)}>
                  <BarChart data={audits.slice(0, 10)} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis
                      type="category"
                      dataKey="auditTitle"
                      tick={{ fontSize: 11 }}
                      stroke="var(--muted-foreground)"
                      width={140}
                    />
                    <Tooltip
                      formatter={(value, _name, item) => {
                        const credits = (item.payload as { totalCostCredits?: number }).totalCostCredits ?? 0;
                        return `${formatClp(Number(value))} (${formatCredits(credits)} ${t.creditsUnit})`;
                      }}
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }}
                    />
                    <Bar dataKey="totalCostClp" fill="var(--cost-supabase-db)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.tableTitle}</CardTitle>
              <div className="flex flex-wrap items-end gap-3 pt-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="from" className="text-xs">
                    {t.filterFrom}
                  </Label>
                  <Input
                    id="from"
                    type="date"
                    className="h-8 w-36 text-xs"
                    value={fromFilter}
                    onChange={(e) => setFromFilter(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="to" className="text-xs">
                    {t.filterTo}
                  </Label>
                  <Input
                    id="to"
                    type="date"
                    className="h-8 w-36 text-xs"
                    value={toFilter}
                    onChange={(e) => setToFilter(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="provider" className="text-xs">
                    {t.filterProvider}
                  </Label>
                  <select
                    id="provider"
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                    value={providerFilter}
                    onChange={(e) => setProviderFilter(e.target.value as CostCategoryKey | "all")}
                  >
                    <option value="all">{t.filterAllProviders}</option>
                    {CATEGORY_ORDER.map((key) => (
                      <option key={key} value={key}>
                        {(t as Record<string, string>)[`service_${key}`]}
                      </option>
                    ))}
                  </select>
                </div>
                <Button size="sm" variant="outline" className="h-8" onClick={() => loadAll(fromFilter, toFilter)}>
                  {t.applyFilters}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => {
                    setFromFilter("");
                    setToFilter("");
                    setProviderFilter("all");
                    loadAll();
                  }}
                >
                  {t.clearFilters}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {filteredAudits.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.noAudits}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t.colAudit}</TableHead>
                        <TableHead>{t.colOrg}</TableHead>
                        <TableHead className="text-right">{t.colStorage}</TableHead>
                        <TableHead className="text-right">{t.colScans}</TableHead>
                        <TableHead className="text-right">{t.colPdfs}</TableHead>
                        <TableHead className="text-right">{t.colDbCost}</TableHead>
                        <TableHead className="text-right">{t.colTotalCost}</TableHead>
                        <TableHead className="text-right">{t.colCredits}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAudits.map((row) => (
                        <TableRow key={row.auditId}>
                          <TableCell className="font-medium">{row.auditTitle}</TableCell>
                          <TableCell className="text-muted-foreground">{row.organizationName}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.storageMb.toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.scansExecuted}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.reportsGenerated}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatClp(row.dbCostClp)}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatClp(row.totalCostClp)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatCredits(row.totalCostCredits)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">{t.estimateNote}</p>
        </>
      )}

      <Dialog open={pricingOpen} onOpenChange={setPricingOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.editPricingTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t.editPricingDesc}</p>

          {pricingLoading ? (
            <Skeleton className="h-48" />
          ) : (
            <div className="flex flex-col gap-3">
              {pricingError && (
                <Alert variant="destructive">
                  <AlertDescription>{pricingError}</AlertDescription>
                </Alert>
              )}
              <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
                {pricingRows.map((row) => (
                  <div key={row.key} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.provider} · {row.service}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{row.unit}</p>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      step="0.0001"
                      className="h-8 w-28 text-right text-xs"
                      value={pricingDrafts[row.key] ?? ""}
                      onChange={(e) => setPricingDrafts((prev) => ({ ...prev, [row.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <Button onClick={savePricing} disabled={pricingSaving} className="self-start">
                {pricingSaving ? t.saving : t.save}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
