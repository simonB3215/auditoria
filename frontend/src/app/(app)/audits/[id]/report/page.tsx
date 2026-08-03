"use client";

import { useEffect, useMemo, useState, use as usePromise } from "react";
import { Download, Loader2 } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import type { AuditReport, Finding, FindingSeverity, EvidenceListResponse } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SeverityBadge } from "@/components/severity-badge";

const SEVERITY_TABS: { value: FindingSeverity | "all"; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "critical", label: "Críticas" },
  { value: "high", label: "Altas" },
  { value: "medium", label: "Medias" },
  { value: "low", label: "Bajas" },
];

export default function AuditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);

  const [findings, setFindings] = useState<Finding[]>([]);
  const [missingRequirements, setMissingRequirements] = useState<Array<{ code: string; title: string }>>([]);
  const [severityFilter, setSeverityFilter] = useState<FindingSeverity | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [report, setReport] = useState<AuditReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      api.get<{ data: Finding[] }>(`/api/v1/audits/${id}/findings`),
      api.get<{ data: EvidenceListResponse }>(`/api/v1/audits/${id}/evidences`),
    ])
      .then(([findingsRes, evidencesRes]) => {
        setFindings(findingsRes.data.data);
        setMissingRequirements(evidencesRes.data.data.missing_requirements);
      })
      .catch((err) => setError(getApiErrorMessage(err, "No se pudo cargar el reporte")))
      .finally(() => setLoading(false));
  }, [id]);

  const filteredFindings = useMemo(
    () => (severityFilter === "all" ? findings : findings.filter((f) => f.severity === severityFilter)),
    [findings, severityFilter]
  );

  async function handleGenerateReport() {
    setGenerating(true);
    setReportError(null);
    try {
      const res = await api.get<{ data: AuditReport }>(`/api/v1/audits/${id}/report`);
      setReport(res.data.data);
      window.open(res.data.data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setReportError(getApiErrorMessage(err, "No se pudo generar el reporte"));
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Reporte ejecutivo</h1>
        <div className="flex items-center gap-3">
          {report && (
            <span className="text-sm text-muted-foreground">
              Score: <span className="font-medium text-foreground">{report.riskScore.score}/100</span> (
              {report.riskScore.complianceLevel})
            </span>
          )}
          <Button onClick={handleGenerateReport} disabled={generating}>
            {generating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
            {generating ? "Generando..." : "Descargar Reporte PDF"}
          </Button>
        </div>
      </div>

      {reportError && (
        <Alert variant="destructive">
          <AlertDescription>{reportError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Requisitos faltantes / documentación pendiente</CardTitle>
        </CardHeader>
        <CardContent>
          {missingRequirements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay requisitos pendientes de evidencia.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {missingRequirements.map((req) => (
                <li key={req.code} className="text-muted-foreground">
                  <span className="font-mono text-xs">[{req.code}]</span> {req.title}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hallazgos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Tabs value={severityFilter} onValueChange={(v) => setSeverityFilter(v as FindingSeverity | "all")}>
            <TabsList>
              {SEVERITY_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {filteredFindings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay hallazgos para este filtro.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severidad</TableHead>
                  <TableHead>Hallazgo</TableHead>
                  <TableHead>Remediación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFindings.map((finding) => (
                  <TableRow key={finding.id}>
                    <TableCell>
                      <SeverityBadge severity={finding.severity} />
                    </TableCell>
                    <TableCell className="font-medium">{finding.title}</TableCell>
                    <TableCell className="text-muted-foreground">{finding.remediation ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
