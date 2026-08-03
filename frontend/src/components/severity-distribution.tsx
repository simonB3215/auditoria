import { SEVERITY_CONFIG } from "@/components/severity-badge";
import type { FindingSeverity } from "@/lib/types";

const ORDER: FindingSeverity[] = ["critical", "high", "medium", "low"];

export function SeverityDistribution({ counts }: { counts: Record<FindingSeverity, number> }) {
  const total = ORDER.reduce((sum, s) => sum + counts[s], 0);

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">Sin hallazgos registrados todavía.</p>;
  }

  return (
    <div className="flex flex-col gap-3" role="img" aria-label="Distribución de hallazgos por severidad">
      {ORDER.map((severity) => {
        const count = counts[severity];
        const pct = total === 0 ? 0 : (count / total) * 100;
        const { label, color, Icon } = SEVERITY_CONFIG[severity];

        return (
          <div key={severity} className="flex items-center gap-3">
            <div className="flex w-20 items-center gap-1.5 text-sm" style={{ color }}>
              <Icon className="size-3.5 shrink-0" aria-hidden />
              {label}
            </div>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width]"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
            <span className="w-6 text-right text-sm font-medium tabular-nums">{count}</span>
          </div>
        );
      })}
    </div>
  );
}
