"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import type { AuditLogEntry } from "@/lib/types";
import { useI18n } from "@/lib/i18n/context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AuditLogTable } from "@/components/audit-log-table";

export default function AuditHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const { dict } = useI18n();
  const t = dict.history;

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .get<{ data: AuditLogEntry[] }>(`/api/v1/audits/${id}/history`)
      .then((res) => setLogs(res.data.data))
      .catch((err) => setError(getApiErrorMessage(err, t.loadFailed)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/audits/${id}`}>
            <ArrowLeft className="size-3.5" aria-hidden />
            {t.backToAudit}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.title}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-48" />
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noEvents}</p>
          ) : (
            <AuditLogTable logs={logs} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
