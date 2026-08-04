import type { OpenPort, TlsCertFinding, HeaderFinding } from "../jobs/scanEngine.js";

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

const TLS_SEVERITY: Record<TlsCertFinding["kind"], FindingSeverity> = {
  expired_cert: "critical",
  untrusted_cert: "high",
  weak_protocol: "high",
  expiring_soon_cert: "medium",
};

const TLS_TITLE: Record<TlsCertFinding["kind"], string> = {
  expired_cert: "Certificado TLS vencido",
  untrusted_cert: "Certificado TLS no confiable",
  weak_protocol: "Protocolo TLS débil habilitado",
  expiring_soon_cert: "Certificado TLS por vencer",
};

const TLS_REMEDIATION: Record<TlsCertFinding["kind"], string> = {
  expired_cert: "Renovar el certificado TLS inmediatamente.",
  untrusted_cert: "Instalar un certificado emitido por una CA reconocida (evitar self-signed en producción).",
  weak_protocol: "Deshabilitar TLSv1/TLSv1.1/SSLv3 en el servidor; exigir TLSv1.2 o superior.",
  expiring_soon_cert: "Renovar el certificado antes de que venza; considerar renovación automática.",
};

export function normalizeTlsFindings(
  auditId: string,
  assetId: string,
  assetValue: string,
  port: number,
  findings: TlsCertFinding[]
): NormalizedFinding[] {
  return findings.map((f) => ({
    audit_id: auditId,
    asset_id: assetId,
    source_engine: "tls-check",
    title: `${TLS_TITLE[f.kind]} en ${assetValue}:${port}`,
    severity: TLS_SEVERITY[f.kind],
    detail: f.detail,
    remediation: TLS_REMEDIATION[f.kind],
  }));
}

export function normalizeHeaderFindings(
  auditId: string,
  assetId: string,
  assetValue: string,
  port: number,
  useHttps: boolean,
  findings: HeaderFinding[]
): NormalizedFinding[] {
  return findings.map((f) => ({
    audit_id: auditId,
    asset_id: assetId,
    source_engine: "http-headers",
    title: `Cabecera de seguridad faltante (${f.header}) en ${assetValue}:${port}`,
    severity: "low",
    detail: `${useHttps ? "https" : "http"}://${assetValue}:${port}/ no incluye la cabecera "${f.header}".`,
    remediation: `Agregar la cabecera "${f.header}" a las respuestas del servidor web.`,
  }));
}
