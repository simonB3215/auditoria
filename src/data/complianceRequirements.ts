export type EvidenceFileKind = "pdf" | "json" | "xlsx";

export interface ComplianceRequirement {
  code: string;
  title: string;
  /** Tipo de archivo esperado como evidencia para este requisito. */
  expectedFileKind: EvidenceFileKind;
  /** Solo para xlsx/json: columnas o campos obligatorios (case-insensitive). */
  requiredFields?: string[];
  /**
   * "technical" = se satisface automáticamente por el motor de escaneo
   * (Nmap/TLS/cabeceras), no espera una evidencia subida — ver
   * `technicalCoverageEngine.ts`. Ausente/"documentary" (default) = requiere
   * evidencia documental, como el resto del checklist.
   */
  kind?: "documentary" | "technical";
  /**
   * Solo relevante para LEY_21663_CL: a qué nivel de obligación aplica.
   * "SE" (Servicios Esenciales) es el piso común; "OIV" (Operadores de
   * Importancia Vital) es el nivel estricto y ACUMULA los requisitos "SE"
   * más los propios — nunca es un subconjunto separado. Requisitos sin
   * `tier` (frameworks que no son la Ley 21.663) no participan del cálculo
   * SE/OIV.
   */
  tier?: "SE" | "OIV";
  /**
   * Solo para kind: "technical" — qué evalúa `technicalCoverageEngine.ts`
   * para decidir si este control pasa. Ver ese archivo para el detalle de
   * cada evaluador.
   */
  technicalCheck?: "asset_inventory" | "tls_encryption" | "http_headers" | "vulnerability_management";
}

/**
 * Checklist mínimo por framework. En una siguiente iteración esto debería
 * vivir en la tabla `compliance_controls` (ver arquitectura-mvp.md), pero
 * para el MVP un catálogo estático alcanza y evita una tabla + CRUD extra.
 */
export const COMPLIANCE_REQUIREMENTS: Record<string, ComplianceRequirement[]> = {
  iso27001: [
    {
      code: "A.5.1.1",
      title: "Política de seguridad de la información",
      expectedFileKind: "pdf",
    },
    {
      code: "A.8.1.1",
      title: "Inventario de activos",
      expectedFileKind: "xlsx",
      requiredFields: ["IP", "Criticidad", "Responsable"],
    },
    {
      code: "A.9.2.1",
      title: "Registro de altas y bajas de usuarios",
      expectedFileKind: "xlsx",
      requiredFields: ["Usuario", "Rol", "Fecha Alta"],
    },
    {
      code: "A.12.4.1",
      title: "Registros de eventos (logging)",
      expectedFileKind: "json",
    },
    {
      code: "A.16.1.1",
      title: "Procedimiento de gestión de incidentes",
      expectedFileKind: "pdf",
    },
  ],
  nist_csf: [
    {
      code: "ID.AM-1",
      title: "Inventario de activos físicos y de software",
      expectedFileKind: "xlsx",
      requiredFields: ["IP", "Criticidad", "Responsable"],
    },
    {
      code: "PR.AC-1",
      title: "Gestión de identidades y credenciales",
      expectedFileKind: "pdf",
    },
    {
      code: "DE.CM-1",
      title: "Monitoreo continuo de la red",
      expectedFileKind: "json",
    },
  ],
  /**
   * Ley N° 21.663 de Ciberseguridad (Chile) — ANCI. Divide los controles en
   * dos ejes independientes:
   *  - kind: si se prueba con evidencia documental subida, o
   *    automáticamente contra los hallazgos del motor de escaneo.
   *  - tier: si aplica al piso común (Servicios Esenciales) o solo al nivel
   *    estricto (Operadores de Importancia Vital, que hereda todo lo de SE).
   */
  ley_21663_cl: [
    // --- Controles técnicos (automatizables por el motor de escaneo) ---
    {
      code: "ANCI-TEC-01",
      title: "Inventario de activos expuestos relevado por escaneo",
      expectedFileKind: "json",
      kind: "technical",
      technicalCheck: "asset_inventory",
      tier: "SE",
    },
    {
      code: "ANCI-TEC-02",
      title: "Cifrado en tránsito vigente (TLS 1.2+, certificado válido)",
      expectedFileKind: "json",
      kind: "technical",
      technicalCheck: "tls_encryption",
      tier: "SE",
    },
    {
      code: "ANCI-TEC-03",
      title: "Cabeceras de seguridad HTTP (HSTS, CSP, X-Frame-Options, X-Content-Type-Options)",
      expectedFileKind: "json",
      kind: "technical",
      technicalCheck: "http_headers",
      tier: "SE",
    },
    {
      code: "ANCI-TEC-04",
      title: "Gestión de vulnerabilidades: sin puertos críticos expuestos sin justificar",
      expectedFileKind: "json",
      kind: "technical",
      technicalCheck: "vulnerability_management",
      tier: "SE",
    },
    // --- Controles documentales / gobernanza — piso común (SE) ---
    {
      code: "ANCI-GOB-01",
      title: "Designación formal de Delegado de Ciberseguridad",
      expectedFileKind: "pdf",
      tier: "SE",
    },
    {
      code: "ANCI-GOB-02",
      title: "Plan de Gestión de Incidentes (reporte a ANCI: alerta 3h / informe 72h)",
      expectedFileKind: "pdf",
      tier: "SE",
    },
    {
      code: "ANCI-GOB-03",
      title: "Política de Continuidad Operacional",
      expectedFileKind: "pdf",
      tier: "SE",
    },
    // --- Controles documentales — exclusivos de Operadores de Importancia Vital (OIV) ---
    {
      code: "ANCI-GOB-04",
      title: "Plan de Continuidad y Recuperación ante Desastres (DRP) certificado",
      expectedFileKind: "pdf",
      tier: "OIV",
    },
    {
      code: "ANCI-GOB-05",
      title: "Auditoría de terceros y cadena de suministro",
      expectedFileKind: "xlsx",
      requiredFields: ["Proveedor", "Servicio Crítico", "Última Auditoría"],
      tier: "OIV",
    },
  ],
};

export function getRequirementsForFramework(framework: string): ComplianceRequirement[] {
  return COMPLIANCE_REQUIREMENTS[framework] ?? [];
}

export function findRequirement(
  framework: string,
  requirementCode: string
): ComplianceRequirement | undefined {
  return getRequirementsForFramework(framework).find((r) => r.code === requirementCode);
}
