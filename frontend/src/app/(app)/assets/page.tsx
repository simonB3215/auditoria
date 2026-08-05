"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, Mail, Plus, ShieldCheck, Trash2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [criticalityFilter, setCriticalityFilter] = useState<string>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newType, setNewType] = useState<AssetType>("ip");
  const [newValue, setNewValue] = useState("");
  const [newCriticality, setNewCriticality] = useState<AssetCriticality>("media");
  const [newTags, setNewTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  // Verificación guiada de dominio (a.md, sección UX): activo actual del
  // modal + copiado del código + sub-modal de delegación a TI.
  const [verifyDomainAsset, setVerifyDomainAsset] = useState<Asset | null>(null);
  const [verifyDomainError, setVerifyDomainError] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegateEmail, setDelegateEmail] = useState("");
  const [delegateSending, setDelegateSending] = useState(false);
  const [delegateError, setDelegateError] = useState<string | null>(null);
  const [delegateSuccess, setDelegateSuccess] = useState(false);

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
    if (typeFilter && typeFilter !== "all") params.set("type", typeFilter);
    if (criticalityFilter && criticalityFilter !== "all") params.set("criticality", criticalityFilter);

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

  function openVerifyDomainDialog(asset: Asset) {
    setVerifyDomainAsset(asset);
    setVerifyDomainError(null);
    setTokenCopied(false);
    setDelegateOpen(false);
    setDelegateEmail("");
    setDelegateError(null);
    setDelegateSuccess(false);
  }

  function handleCopyToken() {
    if (!verifyDomainAsset?.verification_token) return;
    navigator.clipboard.writeText(`aegis-site-verification=${verifyDomainAsset.verification_token}`).then(() => {
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    });
  }

  async function handleVerifyDomainNow() {
    if (!verifyDomainAsset) return;
    setBusyId(verifyDomainAsset.id);
    setVerifyDomainError(null);
    try {
      const res = await api.post<{ data: Asset }>(`/api/v1/assets/${verifyDomainAsset.id}/verify`);
      setAssets((prev) => prev.map((a) => (a.id === verifyDomainAsset.id ? { ...a, ...res.data.data } : a)));
      setVerifyDomainAsset(null);
    } catch (err) {
      setVerifyDomainError(getApiErrorMessage(err, t.verifyFailed));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelegateToIt(e: FormEvent) {
    e.preventDefault();
    if (!verifyDomainAsset) return;
    setDelegateSending(true);
    setDelegateError(null);
    try {
      await api.post(`/api/v1/assets/${verifyDomainAsset.id}/delegate-verification`, { email: delegateEmail });
      setDelegateSuccess(true);
    } catch (err) {
      setDelegateError(getApiErrorMessage(err, t.delegateFailed));
    } finally {
      setDelegateSending(false);
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
                <Select value={newType} onValueChange={(v) => setNewType(v as AssetType)}>
                  <SelectTrigger id="asset-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSET_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {TYPE_LABEL[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Select value={newCriticality} onValueChange={(v) => setNewCriticality(v as AssetCriticality)}>
                  <SelectTrigger id="asset-criticality" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRITICALITIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CRITICALITY_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger size="sm" aria-label={t.filterType}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.filterAll}</SelectItem>
                {ASSET_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {TYPE_LABEL[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={criticalityFilter} onValueChange={setCriticalityFilter}>
              <SelectTrigger size="sm" aria-label={t.filterCriticality}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.filterAll}</SelectItem>
                {CRITICALITIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CRITICALITY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                        {asset.verification_status !== "verified" && asset.type === "domain" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === asset.id}
                            onClick={() => openVerifyDomainDialog(asset)}
                          >
                            <ShieldCheck className="size-3.5" aria-hidden />
                            {t.verify}
                          </Button>
                        )}
                        {asset.verification_status !== "verified" && asset.type !== "domain" && (
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

      <Dialog open={verifyDomainAsset !== null} onOpenChange={(open) => !open && setVerifyDomainAsset(null)}>
        <DialogContent>
          {verifyDomainAsset && !delegateOpen && (
            <>
              <DialogHeader>
                <DialogTitle>{t.verifyDomainTitle}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <p className="rounded-md border bg-muted/50 p-3 text-sm">{t.verifyDomainIntro}</p>

                <div className="flex flex-col gap-2">
                  <Label>{t.verifyDomainTokenLabel}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={`aegis-site-verification=${verifyDomainAsset.verification_token ?? ""}`}
                      className="font-mono text-xs"
                      onFocus={(e) => e.target.select()}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={handleCopyToken}>
                      {tokenCopied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                      {tokenCopied ? t.copied : t.copyCode}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">{t.verifyDomainStepsTitle}</p>
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                    <li>{t.verifyDomainStep1}</li>
                    <li>{t.verifyDomainStep2}</li>
                    <li>{t.verifyDomainStep3}</li>
                    <li>{t.verifyDomainStep4}</li>
                  </ol>
                </div>

                {verifyDomainError && (
                  <Alert variant="destructive">
                    <AlertDescription>{verifyDomainError}</AlertDescription>
                  </Alert>
                )}

                <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setDelegateOpen(true);
                      setDelegateEmail("");
                      setDelegateError(null);
                      setDelegateSuccess(false);
                    }}
                    className="justify-start"
                  >
                    <Mail className="size-3.5" aria-hidden />
                    {t.delegateToIt}
                  </Button>
                  <Button type="button" disabled={busyId === verifyDomainAsset.id} onClick={handleVerifyDomainNow}>
                    <ShieldCheck className="size-3.5" aria-hidden />
                    {busyId === verifyDomainAsset.id ? t.verifying : t.verifyNow}
                  </Button>
                </DialogFooter>
              </div>
            </>
          )}

          {verifyDomainAsset && delegateOpen && (
            <>
              <DialogHeader>
                <DialogTitle>{t.delegateModalTitle}</DialogTitle>
              </DialogHeader>

              {delegateSuccess ? (
                <div className="flex flex-col gap-4">
                  <Alert>
                    <AlertDescription>{t.delegateSuccess}</AlertDescription>
                  </Alert>
                  <Button type="button" variant="outline" onClick={() => setDelegateOpen(false)} className="self-start">
                    {t.close}
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleDelegateToIt} className="flex flex-col gap-4">
                  <p className="text-sm text-muted-foreground">{t.delegateModalDescription}</p>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="delegate-email">{t.delegateEmailLabel}</Label>
                    <Input
                      id="delegate-email"
                      type="email"
                      required
                      value={delegateEmail}
                      onChange={(e) => setDelegateEmail(e.target.value)}
                      placeholder={t.delegateEmailPlaceholder}
                    />
                  </div>

                  {delegateError && (
                    <Alert variant="destructive">
                      <AlertDescription>{delegateError}</AlertDescription>
                    </Alert>
                  )}

                  <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                    <Button type="button" variant="ghost" onClick={() => setDelegateOpen(false)} className="justify-start">
                      {t.cancel}
                    </Button>
                    <Button type="submit" disabled={delegateSending}>
                      {delegateSending ? t.delegateSending : t.delegateSend}
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
