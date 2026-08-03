import { Badge } from "@/components/ui/badge";
import type { AuditStatus } from "@/lib/types";

const STATUS_CONFIG: Record<AuditStatus, { label: string; variant: "secondary" | "default" | "destructive" | "outline" }> = {
  draft: { label: "Borrador", variant: "outline" },
  queued: { label: "En cola", variant: "secondary" },
  running: { label: "En ejecución", variant: "secondary" },
  completed: { label: "Completado", variant: "default" },
  failed: { label: "Falló", variant: "destructive" },
};

export function AuditStatusBadge({ status }: { status: AuditStatus }) {
  const config = STATUS_CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
