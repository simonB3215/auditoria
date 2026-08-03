"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderKanban, ListChecks, Plus, ShieldAlert } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import type { DashboardSummary } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuditStatusBadge } from "@/components/audit-status-badge";
import { SeverityDistribution } from "@/components/severity-distribution";
import type { Framework } from "@/lib/types";

function StatCard({ icon: Icon, label, value }: { icon: typeof FolderKanban; label: string; value: React.ReactNode }) {
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

const FRAMEWORKS: { value: Framework; label: string }[] = [
  { value: "iso27001", label: "ISO 27001" },
  { value: "nist_csf", label: "NIST CSF" },
  { value: "gdpr", label: "GDPR" },
  { value: "local_dp_law", label: "Normativa local de datos" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newAuditTitle, setNewAuditTitle] = useState("");
  const [newAuditFramework, setNewAuditFramework] = useState<Framework>("iso27001");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function loadSummary() {
    setLoading(true);
    api
      .get<{ data: DashboardSummary }>("/api/v1/dashboard/summary")
      .then((res) => setSummary(res.data.data))
      .catch((err) => setError(getApiErrorMessage(err, "No se pudo cargar el dashboard")))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadSummary();
  }, []);

  async function handleCreateAudit(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const res = await api.post<{ data: { id: string } }>("/api/v1/audits", {
        title: newAuditTitle,
        framework: newAuditFramework,
      });
      router.push(`/audits/${res.data.data.id}`);
    } catch (err) {
      setCreateError(getApiErrorMessage(err, "No se pudo crear la auditoría"));
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  if (error || !summary) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error ?? "No se pudo cargar el dashboard"}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={FolderKanban} label="Activos auditados" value={summary.totalAssets} />
        <StatCard icon={ListChecks} label="Cumplimiento global" value={`${summary.averageCoveragePercentage}%`} />
        <StatCard icon={ShieldAlert} label="Auditorías totales" value={summary.totalAudits} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribución de riesgos</CardTitle>
          </CardHeader>
          <CardContent>
            <SeverityDistribution counts={summary.findingsBySeverity} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nueva auditoría</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateAudit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="title">Título</Label>
                <Input
                  id="title"
                  required
                  value={newAuditTitle}
                  onChange={(e) => setNewAuditTitle(e.target.value)}
                  placeholder="Auditoría Q1 2026"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="framework">Framework</Label>
                <select
                  id="framework"
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
                  value={newAuditFramework}
                  onChange={(e) => setNewAuditFramework(e.target.value as Framework)}
                >
                  {FRAMEWORKS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              {createError && (
                <Alert variant="destructive">
                  <AlertDescription>{createError}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={creating}>
                <Plus className="size-4" aria-hidden />
                {creating ? "Creando..." : "Crear auditoría"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Auditorías recientes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {summary.recentAudits.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no creaste ninguna auditoría.</p>
          ) : (
            summary.recentAudits.map((audit) => (
              <Link
                key={audit.id}
                href={`/audits/${audit.id}`}
                className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm hover:bg-muted/60"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{audit.title}</span>
                  <span className="text-xs uppercase text-muted-foreground">{audit.framework}</span>
                </div>
                <div className="flex items-center gap-3">
                  {audit.risk_score !== null && (
                    <div className="flex w-24 items-center gap-2">
                      <Progress value={audit.risk_score} className="h-1.5" />
                      <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                        {audit.risk_score}
                      </span>
                    </div>
                  )}
                  <AuditStatusBadge status={audit.status} />
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
