"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, History, Loader2, ScanSearch } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import type { Audit, ComplianceRequirement, EvidenceListResponse, EvidenceUploadResponse } from "@/lib/types";
import { useI18n } from "@/lib/i18n/context";
import { useProfile } from "@/hooks/useProfile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AuditStatusBadge } from "@/components/audit-status-badge";
import { CoverageMatrix } from "@/components/coverage-matrix";
import { EvidenceUpload } from "@/components/evidence-upload";

export default function AuditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const { dict } = useI18n();
  const t = dict.auditDetail;
  const { profile } = useProfile();
  const canWrite = profile?.role === "ciso" || profile?.role === "auditor" || profile?.role === "auditor_guest";
  const isExpiredGuest = profile?.role === "viewer" && Boolean(profile.expiresAt);

  const [audit, setAudit] = useState<Audit | null>(null);
  const [requirements, setRequirements] = useState<ComplianceRequirement[]>([]);
  const [coverage, setCoverage] = useState<EvidenceListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [scanning, setScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  function loadAll() {
    setLoading(true);
    setError(null);

    api
      .get<{ data: Audit }>(`/api/v1/audits/${id}`)
      .then(async (auditRes) => {
        setAudit(auditRes.data.data);
        const [reqRes, evidencesRes] = await Promise.all([
          api.get<{ data: ComplianceRequirement[] }>(`/api/v1/frameworks/${auditRes.data.data.framework}/requirements`),
          api.get<{ data: EvidenceListResponse }>(`/api/v1/audits/${id}/evidences`),
        ]);
        setRequirements(reqRes.data.data);
        setCoverage(evidencesRes.data.data);
      })
      .catch((err) => setError(getApiErrorMessage(err, t.loadFailed)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleRunScan() {
    if (!canWrite) {
      setScanNotice({
        kind: "error",
        message: isExpiredGuest ? dict.guestPilot.expiredMessage : dict.guestPilot.scanFailed,
      });
      return;
    }
    setScanning(true);
    setScanNotice(null);
    try {
      await api.post(`/api/v1/audits/${id}/run-scan`, {});
      setScanNotice({ kind: "success", message: dict.guestPilot.scanQueued });
      loadAll();
    } catch (err) {
      setScanNotice({ kind: "error", message: getApiErrorMessage(err, dict.guestPilot.scanFailed) });
    } finally {
      setScanning(false);
    }
  }

  function handleUploaded(result: EvidenceUploadResponse) {
    setCoverage((prev) => ({
      evidences: [result.evidence, ...(prev?.evidences ?? [])],
      completion_percentage: result.completion_percentage,
      missing_requirements: result.missing_requirements,
      covered_requirements: result.covered_requirements,
    }));
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (error || !audit) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error ?? t.notFound}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard">
              <ArrowLeft className="size-4" aria-hidden />
              {dict.newAudit.backToDashboard}
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{audit.title}</h1>
            <p className="text-sm uppercase text-muted-foreground">{audit.framework}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AuditStatusBadge status={audit.status} />
          <Button asChild variant="ghost" size="sm">
            <Link href={`/audits/${id}/history`}>
              <History className="size-4" aria-hidden />
              {t.viewHistory}
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={!canWrite ? "opacity-50" : undefined}
            onClick={handleRunScan}
            disabled={scanning}
          >
            {scanning ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ScanSearch className="size-4" aria-hidden />}
            {scanning ? dict.guestPilot.runningScan : dict.guestPilot.runScan}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/audits/${id}/report`}>
              <FileText className="size-4" aria-hidden />
              {t.viewReport}
            </Link>
          </Button>
        </div>
      </div>

      {scanNotice && (
        <Alert variant={scanNotice.kind === "error" ? "destructive" : "default"}>
          <AlertDescription>{scanNotice.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.coverageMatrix}</CardTitle>
          </CardHeader>
          <CardContent>
            {coverage && (
              <CoverageMatrix
                requirements={requirements}
                coveredCodes={coverage.covered_requirements}
                completionPercentage={coverage.completion_percentage}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.uploadEvidence}</CardTitle>
          </CardHeader>
          <CardContent>
            {isExpiredGuest ? (
              <div className="flex flex-col gap-2 rounded-md border border-dashed p-4 opacity-60">
                <p className="text-sm font-medium">{dict.guestPilot.expiredTitle}</p>
                <p className="text-sm text-muted-foreground">{dict.guestPilot.expiredMessage}</p>
              </div>
            ) : (
              <EvidenceUpload auditId={id} requirements={requirements} onUploaded={handleUploaded} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.uploadedEvidences}</CardTitle>
        </CardHeader>
        <CardContent>
          {coverage && coverage.evidences.length > 0 ? (
            <ul className="flex flex-col divide-y">
              {coverage.evidences.map((ev) => (
                <li key={ev.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium">{ev.file_name}</span>
                    {ev.requirement_code && (
                      <span className="text-xs text-muted-foreground">
                        {t.requirementPrefix} {ev.requirement_code}
                      </span>
                    )}
                  </div>
                  <span
                    className={
                      ev.validation_status === "valid"
                        ? "text-[var(--severity-low)]"
                        : "text-[var(--severity-critical)]"
                    }
                  >
                    {ev.validation_status === "valid" ? t.valid : t.withErrors}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t.noEvidences}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
