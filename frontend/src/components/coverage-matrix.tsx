import { CheckCircle2, Circle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { ComplianceRequirement } from "@/lib/types";
import { useI18n } from "@/lib/i18n/context";

interface CoverageMatrixProps {
  requirements: ComplianceRequirement[];
  coveredCodes: string[];
  completionPercentage: number;
}

export function CoverageMatrix({ requirements, coveredCodes, completionPercentage }: CoverageMatrixProps) {
  const { dict } = useI18n();
  const coveredSet = new Set(coveredCodes);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{dict.auditDetail.documentCoverage}</span>
          <span className="tabular-nums text-muted-foreground">{completionPercentage}%</span>
        </div>
        <Progress value={completionPercentage} />
      </div>

      <ul className="flex flex-col gap-1">
        {requirements.map((req) => {
          const covered = coveredSet.has(req.code);
          return (
            <li key={req.code} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm">
              {covered ? (
                <CheckCircle2 className="size-4 shrink-0 text-[var(--severity-low)]" aria-hidden />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
              )}
              <span className={covered ? "" : "text-muted-foreground"}>
                <span className="font-mono text-xs">[{req.code}]</span> {req.title}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
