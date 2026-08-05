"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Building2, Globe, MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import type { AdminActivityEvent, AdminOrgDomain, AdminOrganization, OrganizationPlan } from "@/lib/types";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const dateFormatter = new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
const PLANS: OrganizationPlan[] = ["starter", "pro", "custom"];

export default function AdminOrganizationsPage() {
  const { dict } = useI18n();
  const t = dict.admin.organizations;
  const { toast } = useToast();

  const [orgs, setOrgs] = useState<AdminOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editingOrg, setEditingOrg] = useState<AdminOrganization | null>(null);
  const [editName, setEditName] = useState("");
  const [editPlan, setEditPlan] = useState<OrganizationPlan>("starter");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [detailOrg, setDetailOrg] = useState<AdminOrganization | null>(null);
  const [detailDomains, setDetailDomains] = useState<AdminOrgDomain[]>([]);
  const [detailActivity, setDetailActivity] = useState<AdminActivityEvent[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  function loadOrgs() {
    setLoading(true);
    setError(null);
    api
      .get<{ data: AdminOrganization[] }>("/api/v1/admin/organizations")
      .then((res) => setOrgs(res.data.data))
      .catch((err) => setError(getApiErrorMessage(err, t.loadFailed)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadOrgs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredOrgs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter(
      (o) => o.name.toLowerCase().includes(q) || o.primaryDomain?.toLowerCase().includes(q)
    );
  }, [orgs, search]);

  function openEdit(org: AdminOrganization) {
    setEditingOrg(org);
    setEditName(org.name);
    setEditPlan(org.plan);
    setEditError(null);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingOrg) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await api.patch<{ data: AdminOrganization }>(`/api/v1/admin/organizations/${editingOrg.id}`, {
        name: editName.trim(),
        plan: editPlan,
      });
      setOrgs((prev) => prev.map((o) => (o.id === editingOrg.id ? { ...o, ...res.data.data } : o)));
      setEditingOrg(null);
      toast({ description: t.updateSuccess, variant: "success" });
    } catch (err) {
      setEditError(getApiErrorMessage(err, t.updateFailed));
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleArchive(org: AdminOrganization) {
    setBusyId(org.id);
    try {
      await api.patch(`/api/v1/admin/organizations/${org.id}/suspend`, { suspended: !org.is_suspended });
      setOrgs((prev) => prev.map((o) => (o.id === org.id ? { ...o, is_suspended: !o.is_suspended } : o)));
      toast({ description: org.is_suspended ? t.unarchiveSuccess : t.archiveSuccess, variant: "success" });
    } catch (err) {
      toast({ description: getApiErrorMessage(err, t.archiveFailed), variant: "destructive" });
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
      toast({ description: t.deleteSuccess, variant: "success" });
    } catch (err) {
      toast({ description: getApiErrorMessage(err, t.deleteFailed), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  function openDetail(org: AdminOrganization) {
    setDetailOrg(org);
    setDetailLoading(true);
    Promise.all([
      api.get<{ data: AdminOrgDomain[] }>(`/api/v1/admin/organizations/${org.id}/domains`),
      api.get<{ data: AdminActivityEvent[] }>(`/api/v1/admin/organizations/${org.id}/activity`),
    ])
      .then(([domainsRes, activityRes]) => {
        setDetailDomains(domainsRes.data.data);
        setDetailActivity(activityRes.data.data);
      })
      .finally(() => setDetailLoading(false));
  }

  const PLAN_LABEL: Record<OrganizationPlan, string> = {
    starter: t.planStarter,
    pro: t.planPro,
    custom: t.planCustom,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="pl-8"
        />
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
          ) : filteredOrgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noResults}</p>
          ) : (
            <div className="overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t.colName}</TableHead>
                  <TableHead>{t.colDomain}</TableHead>
                  <TableHead>{t.colPlan}</TableHead>
                  <TableHead>{t.colVerification}</TableHead>
                  <TableHead>{t.colStatus}</TableHead>
                  <TableHead>{t.colCreated}</TableHead>
                  <TableHead className="text-right">{t.colActions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrgs.map((org) => (
                  <TableRow key={org.id} className="cursor-pointer" onClick={() => openDetail(org)}>
                    <TableCell className="font-medium">{org.name}</TableCell>
                    <TableCell className="text-muted-foreground">{org.primaryDomain ?? t.noDomain}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{PLAN_LABEL[org.plan]}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {org.domainStats.verified} / {org.domainStats.total}
                    </TableCell>
                    <TableCell>
                      <Badge variant={org.is_suspended ? "destructive" : "default"}>
                        {org.is_suspended ? t.archived : t.active}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{dateFormatter.format(new Date(org.created_at))}</TableCell>
                    <TableCell className="text-right">
                      <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" disabled={busyId === org.id}>
                              <MoreHorizontal className="size-3.5" aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(org)}>
                              <Pencil className="size-3.5" aria-hidden />
                              {t.edit}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleArchive(org)}>
                              {org.is_suspended ? t.unarchive : t.archive}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => deleteOrg(org)}>
                              <Trash2 className="size-3.5" aria-hidden />
                              {t.delete}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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

      <Dialog open={editingOrg !== null} onOpenChange={(open) => !open && setEditingOrg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.editTitle}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="org-name">{t.fieldName}</Label>
              <Input id="org-name" required value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="org-plan">{t.fieldPlan}</Label>
              <Select value={editPlan} onValueChange={(v) => setEditPlan(v as OrganizationPlan)}>
                <SelectTrigger id="org-plan" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PLAN_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {editError && (
              <Alert variant="destructive">
                <AlertDescription>{editError}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button type="submit" disabled={editSaving}>
                {editSaving ? t.saving : t.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOrg !== null} onOpenChange={(open) => !open && setDetailOrg(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-4" aria-hidden />
              {detailOrg?.name}
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <Skeleton className="h-48" />
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                  <Globe className="size-3.5" aria-hidden />
                  {t.detailDomains}
                </h3>
                {detailDomains.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.noDomains}</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {detailDomains.map((d) => (
                      <li key={d.id} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-xs">{d.value}</span>
                        <Badge variant={d.verification_status === "verified" ? "default" : "secondary"} className="text-[10px]">
                          {d.verification_status === "verified" ? t.domainVerified : t.domainPending}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium">{t.recentActivity}</h3>
                {detailActivity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.noActivity}</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {detailActivity.map((event, i) => (
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
