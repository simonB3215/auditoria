"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, ShieldAlert as ShieldAlertIcon, UserX } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import type { AdminOrganization, AdminUser, UserRole } from "@/lib/types";
import { useI18n } from "@/lib/i18n/context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ROLES: UserRole[] = ["ciso", "auditor", "viewer"];

export default function AdminUsersPage() {
  const { dict } = useI18n();
  const t = dict.admin.users;
  const { toast } = useToast();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [orgs, setOrgs] = useState<AdminOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  function loadAll() {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<{ data: AdminUser[] }>("/api/v1/admin/users"),
      api.get<{ data: AdminOrganization[] }>("/api/v1/admin/organizations"),
    ])
      .then(([usersRes, orgsRes]) => {
        setUsers(usersRes.data.data);
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

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
              <Table className="min-w-[920px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.colName}</TableHead>
                    <TableHead>{t.colEmail}</TableHead>
                    <TableHead>{t.colStatus}</TableHead>
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
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === user.id}
                          onClick={() => toggleDeactivated(user)}
                        >
                          <UserX className="size-3.5" aria-hidden />
                          {user.isDeactivated ? t.reactivate : t.deactivate}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
