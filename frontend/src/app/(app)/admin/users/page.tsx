"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  KeyRound,
  Loader2,
  Search,
  ShieldAlert as ShieldAlertIcon,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserX,
} from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import type { AdminOrganization, AdminUser, AdminUserStats, UserRole } from "@/lib/types";
import { useI18n } from "@/lib/i18n/context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ROLES: UserRole[] = ["ciso", "auditor", "viewer"];

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: typeof UserCheck;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "warning";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <div
          className={
            tone === "warning"
              ? "flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive"
              : "flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          }
        >
          <Icon className="size-5" aria-hidden />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function formatRelativeTime(iso: string | null, locale: string, neverLabel: string): string {
  if (!iso) return neverLabel;
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays <= 0) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "day");
  if (diffDays < 30) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffDays, "day");
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffMonths, "month");
  const diffYears = Math.floor(diffMonths / 12);
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffYears, "year");
}

export default function AdminUsersPage() {
  const { dict, locale } = useI18n();
  const t = dict.admin.users;
  const { toast } = useToast();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminUserStats | null>(null);
  const [orgs, setOrgs] = useState<AdminOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  function loadAll() {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<{ data: AdminUser[]; stats: AdminUserStats }>("/api/v1/admin/users"),
      api.get<{ data: AdminOrganization[] }>("/api/v1/admin/organizations"),
    ])
      .then(([usersRes, orgsRes]) => {
        setUsers(usersRes.data.data);
        setStats(usersRes.data.stats);
        setOrgs(orgsRes.data.data);
      })
      .catch((err) => setError(getApiErrorMessage(err, t.loadFailed)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (orgFilter !== "all" && u.organizationId !== orgFilter) return false;
      if (!q) return true;
      return u.fullName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    });
  }, [users, search, orgFilter]);

  async function updateRole(userId: string, role: UserRole) {
    try {
      await api.post("/api/v1/admin/users/role", { userId, role });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      toast({ description: t.roleUpdateSuccess, variant: "success" });
    } catch (err) {
      toast({ description: getApiErrorMessage(err, t.roleUpdateFailed), variant: "destructive" });
    }
  }

  async function togglePlatformAdmin(user: AdminUser) {
    try {
      await api.post("/api/v1/admin/users/role", { userId: user.id, isPlatformAdmin: !user.isPlatformAdmin });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isPlatformAdmin: !u.isPlatformAdmin } : u)));
      toast({ description: t.roleUpdateSuccess, variant: "success" });
    } catch (err) {
      toast({ description: getApiErrorMessage(err, t.roleUpdateFailed), variant: "destructive" });
    }
  }

  async function reassignOrganization(user: AdminUser, targetOrgId: string) {
    if (!window.confirm(t.reassignConfirm)) return;
    const targetOrg = orgs.find((o) => o.id === targetOrgId);
    setBusyId(user.id);
    try {
      await api.post("/api/v1/admin/users/assign-organization", { userId: user.id, organizationId: targetOrgId });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, organizationId: targetOrgId, organizationName: targetOrg?.name ?? null } : u
        )
      );
      toast({ description: t.reassignSuccess, variant: "success" });
    } catch (err) {
      toast({ description: getApiErrorMessage(err, t.reassignFailed), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function toggleDeactivated(user: AdminUser) {
    const nextDeactivated = !user.isDeactivated;
    if (nextDeactivated && !window.confirm(t.deactivateConfirm)) return;
    setBusyId(user.id);
    try {
      await api.post("/api/v1/admin/users/deactivate", { userId: user.id, deactivated: nextDeactivated });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isDeactivated: nextDeactivated } : u)));
      toast({ description: nextDeactivated ? t.deactivateSuccess : t.reactivateSuccess, variant: "success" });
    } catch (err) {
      toast({ description: getApiErrorMessage(err, t.deactivateFailed), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  function openResetDialog(user: AdminUser) {
    setResetTarget(user);
    setResetPassword("");
    setResetError(null);
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    if (resetPassword.length < 8) {
      setResetError(t.resetTooShort);
      return;
    }

    setResetSaving(true);
    setResetError(null);
    try {
      await api.post("/api/v1/admin/users/reset-password", {
        userId: resetTarget.id,
        newPassword: resetPassword,
      });
      toast({ description: t.resetSuccess, variant: "success" });
      setResetTarget(null);
      setResetPassword("");
    } catch (err) {
      setResetError(getApiErrorMessage(err, t.resetFailed));
    } finally {
      setResetSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={UserCheck}
            label={t.statAccounts}
            value={`${stats.activeCount} / ${stats.inactiveCount}`}
            hint={t.statAccountsHint}
          />
          <StatCard
            icon={ShieldCheck}
            label={t.statSecurity}
            value={`${stats.twoFactorPercentage}%`}
            hint={stats.failedLoginAlertCount > 0 ? t.statSecurityAlert.replace("{count}", String(stats.failedLoginAlertCount)) : t.statSecurityHint}
            tone={stats.failedLoginAlertCount > 0 ? "warning" : "default"}
          />
          <StatCard icon={UserCog} label={t.statPrivileges} value={stats.platformAdminCount} hint={t.statPrivilegesHint} />
          <StatCard
            icon={UserX}
            label={t.statAdoption}
            value={stats.staleAccountCount}
            hint={t.statAdoptionHint}
            tone={stats.staleAccountCount > 0 ? "warning" : "default"}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="pl-8"
          />
        </div>
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger aria-label={t.filterOrganization}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.filterAll}</SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : filteredUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noResults}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1080px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.colName}</TableHead>
                    <TableHead>{t.colEmail}</TableHead>
                    <TableHead>{t.colStatus}</TableHead>
                    <TableHead>{t.colLastSignIn}</TableHead>
                    <TableHead>{t.colRole}</TableHead>
                    <TableHead>{t.colPlatformAdmin}</TableHead>
                    <TableHead>{t.colOrganization}</TableHead>
                    <TableHead className="text-right">{t.colActions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.fullName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{user.email ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={user.isDeactivated ? "destructive" : "default"}>
                          {user.isDeactivated ? t.deactivated : t.active}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatRelativeTime(user.lastSignInAt, locale, t.never)}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          disabled={!ROLES.includes(user.role)}
                          onValueChange={(v) => updateRole(user.id, v as UserRole)}
                        >
                          <SelectTrigger size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {!ROLES.includes(user.role) && (
                              <SelectItem value={user.role}>{dict.nav.roles[user.role]}</SelectItem>
                            )}
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {dict.nav.roles[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={user.isPlatformAdmin ? "default" : "outline"}
                          className="h-7 text-[10px]"
                          onClick={() => togglePlatformAdmin(user)}
                        >
                          <ShieldAlertIcon className="size-3" aria-hidden />
                          {user.isPlatformAdmin ? t.revokeAdmin : t.grantAdmin}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Select
                          value=""
                          disabled={busyId === user.id}
                          onValueChange={(targetOrgId) => reassignOrganization(user, targetOrgId)}
                        >
                          <SelectTrigger size="sm">
                            <SelectValue placeholder={user.organizationName ?? "—"} />
                          </SelectTrigger>
                          <SelectContent>
                            {orgs
                              .filter((o) => o.id !== user.organizationId)
                              .map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {t.moveToOrg} {o.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openResetDialog(user)}>
                            <KeyRound className="size-3.5" aria-hidden />
                            {t.resetPassword}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === user.id}
                            onClick={() => toggleDeactivated(user)}
                          >
                            <UserX className="size-3.5" aria-hidden />
                            {user.isDeactivated ? t.reactivate : t.deactivate}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={resetTarget !== null} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent>
          <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{t.resetDialogTitle}</DialogTitle>
              <DialogDescription>
                {t.resetDialogDesc.replace("{email}", resetTarget?.email ?? resetTarget?.fullName ?? "")}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2">
              <Label htmlFor="reset-new-password">{t.resetNewPassword}</Label>
              <Input
                id="reset-new-password"
                type="text"
                autoComplete="off"
                required
                minLength={8}
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
              />
            </div>

            {resetError && (
              <Alert variant="destructive">
                <AlertDescription>{resetError}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>
                {t.resetCancel}
              </Button>
              <Button type="submit" disabled={resetSaving}>
                {resetSaving && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {resetSaving ? t.resetSaving : t.resetConfirm}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
