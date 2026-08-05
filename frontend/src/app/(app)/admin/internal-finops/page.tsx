"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, DollarSign, Percent, TrendingUp, Users, Wifi, WifiOff } from "lucide-react";
import { FinOpsTabs } from "@/components/finops-tabs";
import { api, getApiErrorMessage } from "@/lib/api";
import type { InternalFinopsProjection } from "@/lib/types";
import { useProfile } from "@/hooks/useProfile";
import { useI18n } from "@/lib/i18n/context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

const clpFormatter = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const ufFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });
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
  icon: typeof DollarSign;
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

export default function InternalFinopsPage() {
  const { dict } = useI18n();
  const t = dict.admin.internalFinops;
  const { profile, loading: profileLoading } = useProfile();

  const [startersCount, setStartersCount] = useState(20);
  const [proCount, setProCount] = useState(5);
  const [marketPenetrationPct, setMarketPenetrationPct] = useState(1);
  const [opexUsd, setOpexUsd] = useState(40);

  const [data, setData] = useState<InternalFinopsProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!profile?.isPlatformAdmin) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        startersCount: String(startersCount),
        proCount: String(proCount),
        marketPenetrationPct: String(marketPenetrationPct),
        opexUsd: String(opexUsd),
      });
      api
        .get<{ data: InternalFinopsProjection }>(`/api/v1/admin/internal-finops/projection?${params}`)
        .then((res) => setData(res.data.data))
        .catch((err) => setError(getApiErrorMessage(err, t.loadFailed)))
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.isPlatformAdmin, startersCount, proCount, marketPenetrationPct, opexUsd]);

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
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin">
            <ArrowLeft className="size-3.5" aria-hidden />
            {t.backToAdmin}
          </Link>
        </Button>
      </div>

      <FinOpsTabs />

      {data && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-sm">
            {t.ufLabel}: {formatClp(data.indicators.ufValue)}
          </Badge>
          <Badge variant="outline" className="text-sm">
            {t.utmLabel}: {formatClp(data.indicators.utmValue)}
          </Badge>
          <Badge variant="outline" className="text-sm">
            {t.dolarLabel}: {formatClp(data.indicators.dolarValue)}
          </Badge>
          <Badge variant={data.indicators.stale ? "secondary" : "default"} className="gap-1.5 text-sm">
            {data.indicators.stale ? (
              <WifiOff className="size-3.5" aria-hidden />
            ) : (
              <Wifi className="size-3.5" aria-hidden />
            )}
            {data.indicators.stale ? t.usingCachedValue : t.connected}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {t.lastUpdated}: {new Date(data.indicators.fetchedAt).toLocaleString("es-CL")}
          </span>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.scenarioTitle}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <Label>{t.startersSliderLabel}</Label>
              <span className="font-medium">{startersCount}</span>
            </div>
            <Slider
              value={[startersCount]}
              min={0}
              max={500}
              step={1}
              onValueChange={([v]) => setStartersCount(v)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <Label>{t.proSliderLabel}</Label>
              <span className="font-medium">{proCount}</span>
            </div>
            <Slider value={[proCount]} min={0} max={500} step={1} onValueChange={([v]) => setProCount(v)} />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <Label>{t.penetrationSliderLabel}</Label>
              <span className="font-medium">{pctFormatter.format(marketPenetrationPct)}%</span>
            </div>
            <Slider
              value={[marketPenetrationPct]}
              min={0}
              max={100}
              step={0.5}
              onValueChange={([v]) => setMarketPenetrationPct(v)}
            />
            {data && (
              <p className="text-xs text-muted-foreground">
                {t.addressableMarketNote}: {data.addressableMarket.potentialClients} {t.potentialClients}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <Label>{t.opexSliderLabel}</Label>
              <span className="font-medium">${opexUsd}</span>
            </div>
            <Slider value={[opexUsd]} min={0} max={1000} step={5} onValueChange={([v]) => setOpexUsd(v)} />
          </div>
        </CardContent>
      </Card>

      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        data && (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <StatCard
                icon={TrendingUp}
                label={t.kpiMrr}
                value={formatClp(data.projection.mrrClp)}
                sub={`${ufFormatter.format(data.projection.mrrUf)} UF`}
              />
              <StatCard icon={TrendingUp} label={t.kpiArr} value={formatClp(data.projection.arrClp)} />
              <StatCard icon={DollarSign} label={t.kpiCogs} value={formatClp(data.projection.cogsClp)} />
              <StatCard icon={DollarSign} label={t.kpiOpex} value={formatClp(data.projection.opexClp)} />
              <StatCard
                icon={Percent}
                label={t.kpiNetMargin}
                value={`${pctFormatter.format(data.projection.netMarginPct)}%`}
              />
              <StatCard
                icon={Users}
                label={t.kpiBreakEven}
                value={data.projection.breakEvenClients !== null ? data.projection.breakEvenClients : "—"}
                sub={data.projection.breakEvenClients !== null ? t.breakEvenClients : t.breakEvenUnreachable}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.projectionChartTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={data.projection.monthlyProjection}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11 }}
                      stroke="var(--muted-foreground)"
                      tickFormatter={(m) => `${t.monthLabel} ${m}`}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      stroke="var(--muted-foreground)"
                      width={90}
                      tickFormatter={(v) => formatClp(Number(v))}
                    />
                    <Tooltip
                      formatter={(value, key) => [
                        formatClp(Number(value)),
                        key === "revenueClp" ? t.seriesRevenue : key === "costsClp" ? t.seriesCosts : t.seriesNetProfit,
                      ]}
                      labelFormatter={(m) => `${t.monthLabel} ${m}`}
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", fontSize: 12 }}
                    />
                    <Legend
                      formatter={(key: string) =>
                        key === "revenueClp" ? t.seriesRevenue : key === "costsClp" ? t.seriesCosts : t.seriesNetProfit
                      }
                      wrapperStyle={{ fontSize: 12 }}
                    />
                    <Line type="monotone" dataKey="revenueClp" stroke="var(--finops-revenue)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="costsClp" stroke="var(--finops-costs)" strokeWidth={2} dot={false} />
                    <Line
                      type="monotone"
                      dataKey="netProfitClp"
                      stroke="var(--finops-profit)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <p className="mt-2 text-xs text-muted-foreground">{t.projectionNote}</p>
              </CardContent>
            </Card>
          </>
        )
      )}
    </div>
  );
}
