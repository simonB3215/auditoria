import { AlertCircle, CheckCircle2, ShieldOff, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { FindingStatus } from "@/lib/types";
import { useI18n } from "@/lib/i18n/context";

const STATUS_VISUALS: Record<FindingStatus, { variant: "default" | "secondary" | "outline"; Icon: typeof AlertCircle }> = {
  open: { variant: "default", Icon: AlertCircle },
  false_positive: { variant: "secondary", Icon: ShieldOff },
  accepted_risk: { variant: "outline", Icon: CheckCircle2 },
  remediated: { variant: "secondary", Icon: Wrench },
};

const STATUS_LABEL_KEY: Record<FindingStatus, "statusOpen" | "statusFalsePositive" | "statusAcceptedRisk" | "statusRemediated"> = {
  open: "statusOpen",
  false_positive: "statusFalsePositive",
  accepted_risk: "statusAcceptedRisk",
  remediated: "statusRemediated",
};

export function FindingStatusBadge({ status }: { status: FindingStatus }) {
  const { dict } = useI18n();
  const { variant, Icon } = STATUS_VISUALS[status];
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="size-3" aria-hidden />
      {dict.report[STATUS_LABEL_KEY[status]]}
    </Badge>
  );
}
