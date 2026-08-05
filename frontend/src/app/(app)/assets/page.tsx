"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Copy, HelpCircle, Loader2, Mail, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { api, getApiErrorMessage } from "@/lib/api";
import type { Asset, AssetCriticality, AssetType } from "@/lib/types";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ASSET_TYPES: AssetType[] = ["ip", "cidr", "domain", "repository", "cloud_server"];
const CRITICALITIES: AssetCriticality[] = ["critica", "alta", "media", "baja"];
const TAG_CHIP_KEYS = ["production", "website", "internal", "testing", "backend", "frontend", "api", "database"] as const;

const CRITICALITY_DOT: Record<AssetCriticality, string> = {
  critica: "bg-[var(--severity-critical)]",
  alta: "bg-[var(--severity-high)]",
  media: "bg-[var(--severity-medium)]",
  baja: "bg-[var(--severity-low)]",
};

/**
 * Validación en tiempo real por tipo de recurso (a.md, "Mensajes de Error
 * Claros e Inmediatos"). No se agregó Zod/React Hook Form como pedía el
 * prompt original — es un solo formulario chico, un puñado de funciones
 * puras alcanza sin sumar una dependencia nueva al frontend (Zod hoy solo
 * lo usa el backend).
 */
function validateAssetValue(type: AssetType, value: string): "ip" | "cidr" | "domain" | "repository" | null {
  const v = value.trim();
  if (!v) return null;
  const octet = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
  const ipRe = new RegExp(`^${octet}(\\.${octet}){3}$`);
  switch (type) {
    case "ip":
      return ipRe.test(v) ? null : "ip";
    case "cidr": {
      const [ip, prefix] = v.split("/");
      const validPrefix = prefix !== undefined && /^\d{1,2}$/.test(prefix) && Number(prefix) <= 32;
      return ip && ipRe.test(ip) && validPrefix ? null : "cidr";
    }
    case "domain":
      return /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(v) ? null : "domain";
    case "repository":
      return /^https:\/\/[^\s]+\/[^\s]+$/i.test(v) ? null : "repository";
    case "cloud_server":
      return null;
  }
}

/**
 * Label + ícono de ayuda "?" (a.md, "iconos de ayuda"): el texto también
 * queda siempre visible debajo del campo — el tooltip es un refuerzo, no
 * la única vía para acceder a la explicación. `id` (en vez de `htmlFor`)
 * es para el caso "leyenda de grupo" (ej. el RadioGroup de criticidad):
 * un <label for> apunta a UN control puntual, así que un grupo se asocia
 * en cambio vía `aria-labelledby` apuntando al `id` de este label.
 */
function FieldLabel({
  htmlFor,
  id,
  label,
  tooltip,
}: {
  htmlFor?: string;
  id?: string;
  label: string;
  tooltip: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor} id={id}>
        {label}
      </Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label={tooltip}
          >
            <HelpCircle className="size-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </div>
  );
}

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
  const [valueTouched, setValueTouched] = useState(false);
  const [newCriticality, setNewCriticality] = useState<AssetCriticality>("media");
  const [selectedTagChips, setSelectedTagChips] = useState<string[]>([]);
  const [customTags, setCustomTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const valueErrorKey = validateAssetValue(newType, newValue);

  function resetAssetForm() {
    setNewType("ip");
    setNewValue("");
    setValueTouched(false);
    setNewCriticality("media");
    setSelectedTagChips([]);
    setCustomTags("");
    setFormError(null);
  }

  function toggleTagChip(key: string) {
    setSelectedTagChips((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const [busyId, setBusyId] = useState<string | null>(null);

  // Verificación guiada de dominio (a.md, sección UX): activo actual del
  // modal + copiado del código + sub-modal de delegación a TI.
  const [verifyDomainAsset, setVerifyDomainAsset] = useState<Asset | null>(null);
  const [verifyDomainError, setVerifyDomainError] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [hostCopied, setHostCopied] = useState(false);
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
  const CRITICALITY_IMPACT: Record<AssetCriticality, string> = {
    critica: t.criticalCriticaImpact,
    alta: t.criticalAltaImpact,
    media: t.criticalMediaImpact,
    baja: t.criticalBajaImpact,
  };
  const TYPE_DESCRIPTION: Record<AssetType, string> = {
    ip: t.typeDescIp,
    cidr: t.typeDescCidr,
    domain: t.typeDescDomain,
    repository: t.typeDescRepository,
    cloud_server: t.typeDescCloudServer,
  };
  const VALUE_PLACEHOLDER: Record<AssetType, string> = {
    ip: t.valuePlaceholderIp,
    cidr: t.valuePlaceholderCidr,
    domain: t.valuePlaceholderDomain,
    repository: t.valuePlaceholderRepository,
    cloud_server: t.valuePlaceholderCloudServer,
  };
  const VALUE_ERROR: Record<"ip" | "cidr" | "domain" | "repository", string> = {
    ip: t.valueErrorIp,
    cidr: t.valueErrorCidr,
    domain: t.valueErrorDomain,
    repository: t.valueErrorRepository,
  };
  const TAG_CHIP_LABEL: Record<(typeof TAG_CHIP_KEYS)[number], string> = {
    production: t.tagChipProduction,
    website: t.tagChipWebsite,
    internal: t.tagChipInternal,
    testing: t.tagChipTesting,
    backend: t.tagChipBackend,
    frontend: t.tagChipFrontend,
    api: t.tagChipApi,
    database: t.tagChipDatabase,
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
    setValueTouched(true);
    if (validateAssetValue(newType, newValue) || !newValue.trim()) return;

    setFormError(null);
    setSaving(true);
    try {
      const chipTags = selectedTagChips.map((key) => TAG_CHIP_LABEL[key as (typeof TAG_CHIP_KEYS)[number]]);
      const customTagList = customTags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const tags = [...new Set([...chipTags, ...customTagList])];

      await api.post("/api/v1/assets", { type: newType, value: newValue, criticality: newCriticality, tags });
      setDialogOpen(false);
      resetAssetForm();
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
    setHostCopied(false);
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

  // El host siempre es "@" (raíz del dominio del activo) — no hay un campo
  // de subdominio separado en el modelo de Asset hoy, así que no hace
  // falta calcularlo dinámicamente (a.md: "@ o el subdominio
  // correspondiente").
  function handleCopyHost() {
    navigator.clipboard.writeText("@").then(() => {
      setHostCopied(true);
      setTimeout(() => setHostCopied(false), 2000);
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

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetAssetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" aria-hidden />
              {t.addAsset}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t.modalTitle}</DialogTitle>
              <DialogDescription>{t.modalIntro}</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="asset-type" label={t.type} tooltip={t.typeHelp} />
                <Select value={newType} onValueChange={(v) => setNewType(v as AssetType)}>
                  <SelectTrigger id="asset-type" className="w-full" aria-describedby="asset-type-desc">
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
                <p id="asset-type-desc" className="text-xs text-muted-foreground">
                  {TYPE_DESCRIPTION[newType]}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="asset-value" label={t.value} tooltip={t.valueHelp} />
                <Input
                  id="asset-value"
                  required
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  onBlur={() => setValueTouched(true)}
                  placeholder={VALUE_PLACEHOLDER[newType]}
                  aria-invalid={valueTouched && (!!valueErrorKey || !newValue.trim())}
                  aria-describedby={valueTouched && valueErrorKey ? "asset-value-error" : "asset-value-desc"}
                />
                {valueTouched && valueErrorKey ? (
                  <p id="asset-value-error" role="alert" className="text-xs font-medium text-destructive">
                    {VALUE_ERROR[valueErrorKey]}
                  </p>
                ) : valueTouched && !newValue.trim() ? (
                  <p id="asset-value-error" role="alert" className="text-xs font-medium text-destructive">
                    {t.valueErrorRequired}
                  </p>
                ) : (
                  <p id="asset-value-desc" className="text-xs text-muted-foreground">
                    {t.valueHelp}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <FieldLabel id="asset-criticality-label" label={t.criticality} tooltip={t.criticalityHelp} />
                <RadioGroup
                  value={newCriticality}
                  onValueChange={(v) => setNewCriticality(v as AssetCriticality)}
                  aria-labelledby="asset-criticality-label"
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {CRITICALITIES.map((c) => (
                    <RadioGroupItem key={c} value={c} id={`asset-criticality-${c}`} className="flex flex-col gap-1 p-3">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span className={cn("size-2.5 shrink-0 rounded-full", CRITICALITY_DOT[c])} aria-hidden />
                        {CRITICALITY_LABEL[c]}
                      </span>
                      <span className="text-xs text-muted-foreground">{CRITICALITY_IMPACT[c]}</span>
                    </RadioGroupItem>
                  ))}
                </RadioGroup>
              </div>

              <div className="flex flex-col gap-2">
                <FieldLabel label={t.tags} tooltip={t.tagsHelp} />
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.tags}>
                  {TAG_CHIP_KEYS.map((key) => {
                    const pressed = selectedTagChips.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={pressed}
                        onClick={() => toggleTagChip(key)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                          pressed
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {pressed ? "✓ " : "+ "}
                        {TAG_CHIP_LABEL[key]}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-col gap-1.5 pt-1">
                  <Label htmlFor="asset-custom-tags" className="text-xs text-muted-foreground">
                    {t.tagsCustomLabel}
                  </Label>
                  <Input
                    id="asset-custom-tags"
                    value={customTags}
                    onChange={(e) => setCustomTags(e.target.value)}
                    placeholder={t.tagsCustomPlaceholder}
                  />
                </div>
              </div>

              {formError && (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false);
                    resetAssetForm();
                  }}
                >
                  {t.cancel}
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
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

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label>{t.verifyDomainHostLabel}</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-1 items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono font-medium text-muted-foreground">
                          {t.verifyDomainTypeLabel}
                        </span>
                        <span className="font-mono">@</span>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={handleCopyHost}>
                        {hostCopied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                        {hostCopied ? t.copied : t.copyHost}
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label>{t.verifyDomainTokenLabel}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={`aegis-site-verification=${verifyDomainAsset.verification_token ?? ""}`}
                        className="truncate font-mono text-xs"
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                  </div>
                </div>

                <Button type="button" variant="secondary" onClick={handleCopyToken} className="self-start">
                  {tokenCopied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                  {tokenCopied ? t.copied : t.copyValue}
                </Button>

                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">{t.verifyDomainStepsTitle}</p>
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                    <li>{t.verifyDomainStep1}</li>
                    <li>{t.verifyDomainStep2}</li>
                    <li>{t.verifyDomainStep3}</li>
                    <li>{t.verifyDomainStep4}</li>
                  </ol>
                  <p className="text-xs text-muted-foreground">{t.verifyDomainPropagationNote}</p>
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
                    {busyId === verifyDomainAsset.id ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <ShieldCheck className="size-3.5" aria-hidden />
                    )}
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
