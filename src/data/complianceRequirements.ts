export type EvidenceFileKind = "pdf" | "json" | "xlsx";

export interface ComplianceRequirement {
  code: string;
  title: string;
  /** Tipo de archivo esperado como evidencia para este requisito. */
  expectedFileKind: EvidenceFileKind;
  /** Solo para xlsx/json: columnas o campos obligatorios (case-insensitive). */
  requiredFields?: string[];
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
