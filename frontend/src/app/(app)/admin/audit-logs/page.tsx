"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import type { AdminOrganization, AuditLogAction, PlatformAuditLogEntry } from "@/lib/types";
import { useProfile } from "@/hooks/useProfile";
import { useI18n } from "@/lib/i18n/context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AuditLogTable } from "@/components/audit-log-table";

const ACTIONS: AuditLogAction[] = [
  "EVIDENCE_UPLOADED",
  "FINDING_STATUS_CHANGED",
  "REPORT_GENERATED",
  "USER_ROLE_CHANGED",
  "ORGANIZATION_SUSPENDED",
  "ORGANIZATION_REACTIVATED",
  "ORGANIZATION_DELETED",
  "RETENTION_POLICY_UPDATED",
  "EVIDENCE_PURGED",
];

export default function AdminAuditLogsPage() {
  const { dict } = useI18n();
  const t = dict.admin.auditLogs;
  const { profile, loading: profileLoading } = useProfile();

  const [logs, setLogs] = useState<PlatformAuditLogEntry[]>([]);
  const [orgs, setOrgs] = useState<AdminOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [orgFilter, setOrgFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState<AuditLogAction | "all">("all");

  function loadLogs(orgId?: string, action?: string) {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (orgId && orgId !== "all") params.set("organizationId", orgId);
    if (action && action !== "all") params.set("action", action);
    params.set("limit", "200");

    api
      .get<{ data: PlatformAuditLogEntry[] }>(`/api/v1/admin/audit-logs?${params.toString()}`)
      .then((res) => setLogs(res.data.data))
      .catch((err) => setError(getApiErrorMessage(err, t.loadFailed)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!profile?.isPlatformAdmin) return;
    loadLogs();
    api
      .get<{ data: AdminOrganization[] }>("/api/v1/admin/organizations")
      .then((res) => setOrgs(res.data.data))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.isPlatformAdmin]);

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="size-4" aria-hidden />
            {t.title}
          </CardTitle>
          <div className="flex flex-wrap items-end gap-3 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="org" className="text-xs">
                {t.filterOrg}
              </Label>
              <Select value={orgFilter} onValueChange={setOrgFilter}>
                <SelectTrigger id="org" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.filterAllOrgs}</SelectItem>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="action" className="text-xs">
                {t.filterAction}
              </Label>
              <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as AuditLogAction | "all")}>
                <SelectTrigger id="action" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.filterAllActions}</SelectItem>
                  {ACTIONS.map((action) => (
                    <SelectItem key={action} value={action}>
                      {(dict.history as Record<string, string>)[`action_${action}`]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" className="h-8" onClick={() => loadLogs(orgFilter, actionFilter)}>
              {t.applyFilters}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => {
                setOrgFilter("all");
                setActionFilter("all");
                loadLogs();
              }}
            >
              {t.clearFilters}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64" />
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noEvents}</p>
          ) : (
            <AuditLogTable logs={logs} showOrg />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
