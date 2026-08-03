import { AlertTriangle, AlertOctagon, AlertCircle, Info } from "lucide-react";
import type { FindingSeverity } from "@/lib/types";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const SEVERITY_VISUALS: Record<FindingSeverity, { color: string; Icon: typeof AlertTriangle }> = {
  critical: { color: "var(--severity-critical)", Icon: AlertOctagon },
  high: { color: "var(--severity-high)", Icon: AlertTriangle },
  medium: { color: "var(--severity-medium)", Icon: AlertCircle },
  low: { color: "var(--severity-low)", Icon: Info },
};

/** Nunca solo color: siempre ícono + texto, por contraste insuficiente de warning/serious en modo claro. */
export function SeverityBadge({ severity, className }: { severity: FindingSeverity; className?: string }) {
  const { dict } = useI18n();
  const { color, Icon } = SEVERITY_VISUALS[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        className
      )}
      style={{ color, borderColor: color }}
    >
      <Icon className="size-3.5" aria-hidden />
      {dict.severity[severity]}
    </span>
  );
}

export { SEVERITY_VISUALS };
