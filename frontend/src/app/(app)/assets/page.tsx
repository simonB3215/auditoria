"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import type { Asset, AssetCriticality, AssetType } from "@/lib/types";
import { useI18n } from "@/lib/i18n/context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ASSET_TYPES: AssetType[] = ["ip", "cidr", "domain", "repository", "cloud_server"];
const CRITICALITIES: AssetCriticality[] = ["critica", "alta", "media", "baja"];

export default function AssetsPage() {
  const { dict } = useI18n();
  const t = dict.assets;

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<string>("");
  const [criticalityFilter, setCriticalityFilter] = useState<string>("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newType, setNewType] = useState<AssetType>("ip");
  const [newValue, setNewValue] = useState("");
  const [newCriticality, setNewCriticality] = useState<AssetCriticality>("media");
  const [newTags, setNewTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  const TYPE_LABEL: Record<AssetType, string> = {
    ip: t.typeIp,
    cidr: t.typeCidr,
    domain: t.typeDomain,
    repository: t.typeRepository,
    cloud_server: t.typeCloudServer,
  };
  const CRITICALITY_LABEL: Record<AssetCriticality, string> = {
    critica: t.criticalCritica,
    alta: t.criticalAlta,
    media: t.criticalMedia,
    baja: t.criticalBaja,
  };

  function loadAssets() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (typeFilter) params.set("type", typeFilter);
    if (criticalityFilter) params.set("criticality", criticalityFilter);

    api
      .get<{ data: Asset[] }>(`/api/v1/assets${params.toString() ? `?${params}` : ""}`)
      .then((res) => setAssets(res.data.data))
      .catch((err) => setError(getApiErrorMessage(err, t.loadFailed)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, criticalityFilter]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      await api.post("/api/v1/assets", {
        type: newType,
        value: newValue,
        criticality: newCriticality,
        tags: newTags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setDialogOpen(false);
      setNewValue("");
      setNewTags("");
      loadAssets();
    } catch (err) {
      setFormError(getApiErrorMessage(err, t.createFailed));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t.deleteConfirm)) return;
    setBusyId(id);
    try {
      await api.delete(`/api/v1/assets/${id}`);
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(getApiErrorMessage(err, t.deleteFailed));
    } finally {
      setBusyId(null);
    }
  }

  async function handleVerify(id: string) {
    setBusyId(id);
    try {
      const res = await api.post<{ data: Asset }>(`/api/v1/assets/${id}/verify`);
      setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, ...res.data.data } : a)));
    } catch (err) {
      setError(getApiErrorMessage(err, t.verifyFailed));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t.title}</h1>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" aria-hidden />
              {t.addAsset}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t.addAsset}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="asset-type">{t.type}</Label>
                <select
                  id="asset-type"
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as AssetType)}
                >
                  {ASSET_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABEL[type]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="asset-value">{t.value}</Label>
                <Input
                  id="asset-value"
                  required
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder={t.valuePlaceholder}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="asset-criticality">{t.criticality}</Label>
                <select
                  id="asset-criticality"
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
                  value={newCriticality}
                  onChange={(e) => setNewCriticality(e.target.value as AssetCriticality)}
                >
                  {CRITICALITIES.map((c) => (
                    <option key={c} value={c}>
                      {CRITICALITY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="asset-tags">{t.tags}</Label>
                <Input
                  id="asset-tags"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder={t.tagsPlaceholder}
                />
              </div>

              {formError && (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving ? t.saving : t.save}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3">
          <CardTitle className="text-base">{t.title}</CardTitle>
          <div className="ml-auto flex flex-wrap gap-2">
            <select
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label={t.filterType}
            >
              <option value="">{t.filterAll}</option>
              {ASSET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABEL[type]}
                </option>
              ))}
            </select>
            <select
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
              value={criticalityFilter}
              onChange={(e) => setCriticalityFilter(e.target.value)}
              aria-label={t.filterCriticality}
            >
              <option value="">{t.filterAll}</option>
              {CRITICALITIES.map((c) => (
                <option key={c} value={c}>
                  {CRITICALITY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
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
          ) : assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noAssets}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.colType}</TableHead>
                  <TableHead>{t.colValue}</TableHead>
                  <TableHead>{t.colCriticality}</TableHead>
                  <TableHead>{t.colTags}</TableHead>
                  <TableHead>{t.colStatus}</TableHead>
                  <TableHead className="text-right">{t.colActions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell>{TYPE_LABEL[asset.type]}</TableCell>
                    <TableCell className="font-mono text-xs">{asset.value}</TableCell>
                    <TableCell>{CRITICALITY_LABEL[asset.criticality]}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {asset.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={asset.verification_status === "verified" ? "default" : "secondary"}>
                        {asset.verification_status === "verified" ? t.verified : t.pending}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {asset.verification_status !== "verified" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === asset.id}
                            onClick={() => handleVerify(asset.id)}
                          >
                            <ShieldCheck className="size-3.5" aria-hidden />
                            {t.verify}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === asset.id}
                          onClick={() => handleDelete(asset.id)}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                    </TableCell>
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
