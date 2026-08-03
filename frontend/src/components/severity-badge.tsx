import { AlertTriangle, AlertOctagon, AlertCircle, Info } from "lucide-react";
import type { FindingSeverity } from "@/lib/types";
import { cn } from "@/lib/utils";

const SEVERITY_CONFIG: Record<
  FindingSeverity,
  { label: string; color: string; Icon: typeof AlertTriangle }
> = {
  critical: { label: "Crítica", color: "var(--severity-critical)", Icon: AlertOctagon },
  high: { label: "Alta", color: "var(--severity-high)", Icon: AlertTriangle },
  medium: { label: "Media", color: "var(--severity-medium)", Icon: AlertCircle },
  low: { label: "Baja", color: "var(--severity-low)", Icon: Info },
};

/** Nunca solo color: siempre ícono + texto, por contraste insuficiente de warning/serious en modo claro. */
export function SeverityBadge({ severity, className }: { severity: FindingSeverity; className?: string }) {
  const { label, color, Icon } = SEVERITY_CONFIG[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        className
      )}
      style={{ color, borderColor: color }}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

export { SEVERITY_CONFIG };
