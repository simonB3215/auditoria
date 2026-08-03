import { fileTypeFromBuffer } from "file-type";
import ExcelJS from "exceljs";
import type { EvidenceFileKind } from "../data/complianceRequirements.js";

export interface FileValidationResult {
  valid: boolean;
  detectedKind: EvidenceFileKind | null;
  errors: string[];
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Capa 1 - Validacion estructural (magic bytes).
 * No confia en la extension ni el Content-Type declarados por el cliente:
 * inspecciona los primeros bytes reales del archivo.
 */
export async function detectFileKind(
  buffer: Buffer,
  declaredFileName: string
): Promise<{ kind: EvidenceFileKind | null; error?: string }> {
  const detected = await fileTypeFromBuffer(buffer);
  const declaredExt = declaredFileName.split(".").pop()?.toLowerCase();

  if (detected) {
    if (detected.ext === "pdf" && declaredExt === "pdf") {
      return { kind: "pdf" };
    }
    if (detected.mime === XLSX_MIME && (declaredExt === "xlsx" || detected.ext === "xlsx")) {
      return { kind: "xlsx" };
    }
    // file-type reconocio un formato binario concreto que no esta permitido
    // (ejecutables, imagenes, zip generico, etc.) o que no coincide con la
    // extension declarada: se rechaza explicitamente.
    return {
      kind: null,
      error: `El contenido del archivo fue identificado como "${detected.mime}", que no coincide con un formato permitido (.pdf/.xlsx) ni con la extension declarada.`,
    };
  }

  // JSON no tiene magic bytes: solo se acepta si no fue identificado como
  // ningun binario conocido (paso anterior) Y decodifica como JSON valido.
  if (declaredExt === "json") {
    const nullByte = 0;
    if (buffer.includes(nullByte)) {
      return { kind: null, error: "El archivo .json contiene bytes nulos: no es texto plano valido." };
    }
    const text = buffer.toString("utf8");
    try {
      JSON.parse(text);
      return { kind: "json" };
    } catch {
      return { kind: null, error: "El archivo .json no contiene JSON valido." };
    }
  }

  return { kind: null, error: "No se pudo determinar un tipo de archivo permitido (.pdf, .json, .xlsx)." };
}

/**
 * Capa 2 - Validacion semantica: para archivos parseables (xlsx/json),
 * confirma que contengan los campos obligatorios del requisito.
 */
export async function validateSemanticContent(
  kind: EvidenceFileKind,
  buffer: Buffer,
  requiredFields: string[] | undefined
): Promise<string[]> {
  const errors: string[] = [];
  if (!requiredFields || requiredFields.length === 0) {
    return errors;
  }

  if (kind === "json") {
    const parsed = JSON.parse(buffer.toString("utf8"));
    const records: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
    const firstRecord = records[0];
    const keys = new Set(
      typeof firstRecord === "object" && firstRecord !== null
        ? Object.keys(firstRecord).map((k) => k.trim().toLowerCase())
        : []
    );
    for (const field of requiredFields) {
      if (!keys.has(field.trim().toLowerCase())) {
        errors.push(`Falta el campo obligatorio "${field}" en el JSON.`);
      }
    }
    return errors;
  }

  if (kind === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      errors.push("El archivo Excel no contiene ninguna hoja.");
      return errors;
    }

    const headerRow = worksheet.getRow(1);
    const headers = new Set<string>();
    headerRow.eachCell({ includeEmpty: false }, (cell) => {
      const value = cell.value?.toString().trim().toLowerCase();
      if (value) headers.add(value);
    });

    for (const field of requiredFields) {
      if (!headers.has(field.trim().toLowerCase())) {
        errors.push(`Falta la columna obligatoria "${field}" en la hoja de calculo.`);
      }
    }
    return errors;
  }

  return errors;
}
