import { Badge } from "@/components/ui/badge";
import type { AuditStatus } from "@/lib/types";
import { useI18n } from "@/lib/i18n/context";

const STATUS_VARIANT: Record<AuditStatus, "secondary" | "default" | "destructive" | "outline"> = {
  draft: "outline",
  queued: "secondary",
  running: "secondary",
  completed: "default",
  failed: "destructive",
};

export function AuditStatusBadge({ status }: { status: AuditStatus }) {
  const { dict } = useI18n();
  return <Badge variant={STATUS_VARIANT[status]}>{dict.auditStatus[status]}</Badge>;
}
