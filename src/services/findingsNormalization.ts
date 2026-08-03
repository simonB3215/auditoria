import type { OpenPort } from "../jobs/scanEngine.js";

export type FindingSeverity = "critical" | "high" | "medium" | "low";

export interface NormalizedFinding {
  audit_id: string;
  asset_id: string;
  source_engine: string;
  title: string;
  severity: FindingSeverity;
  detail: string;
  remediation: string;
}

/**
 * Heurística de severidad por puerto/servicio expuesto. Es una aproximación
 * razonable para un MVP (protocolos en texto plano o de administración
 * remota se consideran de mayor riesgo); no reemplaza un análisis de
 * vulnerabilidades real (CVE matching, versión exacta del servicio, etc.).
 */
const SEVERITY_BY_PORT: Record<number, { severity: FindingSeverity; label: string; remediation: string }> = {
  21: { severity: "high", label: "FTP en texto plano expuesto", remediation: "Reemplazar por SFTP/FTPS o restringir el acceso por firewall." },
  23: { severity: "critical", label: "Telnet (texto plano) expuesto", remediation: "Deshabilitar Telnet; usar SSH." },
  25: { severity: "medium", label: "SMTP expuesto", remediation: "Restringir a IPs conocidas y verificar que no permita relay abierto." },
  445: { severity: "high", label: "SMB expuesto a la red", remediation: "Restringir SMB a la red interna; nunca exponerlo a Internet." },
  3306: { severity: "high", label: "MySQL expuesto a la red", remediation: "Restringir el acceso a la base de datos solo a hosts de aplicación conocidos." },
  3389: { severity: "high", label: "RDP expuesto a la red", remediation: "Colocar detrás de VPN/bastion host y exigir MFA." },
  5432: { severity: "high", label: "PostgreSQL expuesto a la red", remediation: "Restringir el acceso a la base de datos solo a hosts de aplicación conocidos." },
  6379: { severity: "critical", label: "Redis expuesto sin autenticación por defecto", remediation: "Habilitar `requirepass`/ACLs y restringir por firewall." },
  27017: { severity: "high", label: "MongoDB expuesto a la red", remediation: "Restringir el acceso a la base de datos solo a hosts de aplicación conocidos." },
};

function classifyPort(port: number): { severity: FindingSeverity; label: string; remediation: string } {
  return (
    SEVERITY_BY_PORT[port] ?? {
      severity: "medium" as const,
      label: "Puerto abierto no clasificado",
      remediation: "Confirmar que el servicio expuesto es intencional y necesario; cerrar si no lo es.",
    }
  );
}

export function normalizeOpenPorts(
  auditId: string,
  assetId: string,
  assetValue: string,
  openPorts: OpenPort[]
): NormalizedFinding[] {
  return openPorts.map((p) => {
    const classification = classifyPort(p.port);
    return {
      audit_id: auditId,
      asset_id: assetId,
      source_engine: "nmap",
      title: `${classification.label}: puerto ${p.port}/${p.protocol} (${p.service}) en ${assetValue}`,
      severity: classification.severity,
      detail: `Nmap detectó el puerto ${p.port}/${p.protocol} abierto ejecutando "${p.service}" en ${assetValue}.`,
      remediation: classification.remediation,
    };
  });
}
