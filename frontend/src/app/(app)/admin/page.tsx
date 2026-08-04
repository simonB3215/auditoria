"use client";

import { useEffect, useState } from "react";
import { Building2, Database, ShieldAlert as ShieldAlertIcon, Trash2, Users } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import type { AdminActivityEvent, AdminMember, AdminOrganization, UserRole } from "@/lib/types";
import { useProfile } from "@/hooks/useProfile";
import { useI18n } from "@/lib/i18n/context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: React.ReactNode }) {
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

const ROLES: UserRole[] = ["ciso", "auditor", "viewer"];

export default function AdminPage() {
  const { dict } = useI18n();
  const t = dict.admin;
  const { profile, loading: profileLoading } = useProfile();

  const [orgs, setOrgs] = useState<AdminOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [selectedOrg, setSelectedOrg] = useState<AdminOrganization | null>(null);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [activity, setActivity] = useState<AdminActivityEvent[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  function loadOrgs() {
    setLoading(true);
    api
      .get<{ data: AdminOrganization[] }>("/api/v1/admin/organizations")
      .then((res) => setOrgs(res.data.data))
      .catch((err) => setError(getApiErrorMessage(err, t.loadFailed)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (profile?.isPlatformAdmin) loadOrgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.isPlatformAdmin]);

  async function toggleSuspend(org: AdminOrganization) {
    setBusyId(org.id);
    try {
      await api.patch(`/api/v1/admin/organizations/${org.id}/suspend`, { suspended: !org.is_suspended });
      setOrgs((prev) => prev.map((o) => (o.id === org.id ? { ...o, is_suspended: !o.is_suspended } : o)));
    } catch (err) {
      setError(getApiErrorMessage(err, t.actionFailed));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteOrg(org: AdminOrganization) {
    if (!window.confirm(t.deleteConfirm)) return;
    setBusyId(org.id);
    try {
      await api.delete(`/api/v1/admin/organizations/${org.id}`);
      setOrgs((prev) => prev.filter((o) => o.id !== org.id));
    } catch (err) {
      setError(getApiErrorMessage(err, t.actionFailed));
    } finally {
      setBusyId(null);
    }
  }

  function openDetail(org: AdminOrganization) {
    setSelectedOrg(org);
    setDetailLoading(true);
    Promise.all([
      api.get<{ data: AdminMember[] }>(`/api/v1/admin/organizations/${org.id}/members`),
      api.get<{ data: AdminActivityEvent[] }>(`/api/v1/admin/organizations/${org.id}/activity`),
    ])
      .then(([membersRes, activityRes]) => {
        setMembers(membersRes.data.data);
        setActivity(activityRes.data.data);
      })
      .finally(() => setDetailLoading(false));
  }

  async function updateRole(userId: string, role: UserRole) {
    await api.post("/api/v1/admin/users/role", { userId, role });
    setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, role } : m)));
  }

  async function togglePlatformAdmin(member: AdminMember) {
    await api.post("/api/v1/admin/users/role", { userId: member.id, isPlatformAdmin: !member.is_platform_admin });
    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, is_platform_admin: !m.is_platform_admin } : m))
    );
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

  const totalMembers = orgs.reduce((sum, o) => sum + o.memberCount, 0);
  const totalStorage = orgs.reduce((sum, o) => sum + o.storageBytes, 0);

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
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard icon={Building2} label={t.totalOrgs} value={orgs.length} />
            <StatCard icon={Users} label={t.totalMembers} value={totalMembers} />
            <StatCard icon={Database} label={t.totalStorage} value={formatBytes(totalStorage)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.organizations}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.colName}</TableHead>
                    <TableHead>{t.colMembers}</TableHead>
                    <TableHead>{t.colAudits}</TableHead>
                    <TableHead>{t.colStorage}</TableHead>
                    <TableHead>{t.colStatus}</TableHead>
                    <TableHead className="text-right">{t.colActions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.map((org) => (
                    <TableRow key={org.id} className="cursor-pointer" onClick={() => openDetail(org)}>
                      <TableCell className="font-medium">{org.name}</TableCell>
                      <TableCell>{org.memberCount}</TableCell>
                      <TableCell>{org.auditCount}</TableCell>
                      <TableCell>{formatBytes(org.storageBytes)}</TableCell>
                      <TableCell>
                        <Badge variant={org.is_suspended ? "destructive" : "default"}>
                          {org.is_suspended ? t.suspended : t.active}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === org.id}
                            onClick={() => toggleSuspend(org)}
                          >
                            {org.is_suspended ? t.reactivate : t.suspend}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId === org.id}
                            onClick={() => deleteOrg(org)}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={selectedOrg !== null} onOpenChange={(open) => !open && setSelectedOrg(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedOrg?.name}</DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <Skeleton className="h-48" />
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="mb-2 text-sm font-medium">{t.members}</h3>
                <ul className="flex flex-col gap-2">
                  {members.map((member) => (
                    <li key={member.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>{member.full_name ?? member.id}</span>
                      <div className="flex items-center gap-2">
                        <select
                          className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs"
                          value={member.role}
                          onChange={(e) => updateRole(member.id, e.target.value as UserRole)}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {dict.nav.roles[r]}
                            </option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant={member.is_platform_admin ? "default" : "outline"}
                          className="h-7 text-[10px]"
                          onClick={() => togglePlatformAdmin(member)}
                        >
                          <ShieldAlertIcon className="size-3" aria-hidden />
                          {member.is_platform_admin ? t.revokeAdmin : t.grantAdmin}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium">{t.activity}</h3>
                {activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.noActivity}</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {activity.map((event, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        {event.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
