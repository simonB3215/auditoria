import { supabaseAdmin } from "../config/supabase.js";
import { env } from "../config/env.js";
import { encryptEvidence } from "../utils/evidenceCrypto.js";

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}

interface UploadEvidenceParams {
  organizationId: string;
  auditId: string;
  evidenceId: string;
  fileName: string;
  buffer: Buffer;
}

/**
 * Cifra la evidencia (AES-256-GCM) y la sube al bucket privado de Supabase
 * Storage. El bucket nunca se expone directamente al cliente: toda lectura
 * futura debe pasar por el backend (con service_role), que descifra al vuelo.
 */
export async function uploadEncryptedEvidence(params: UploadEvidenceParams): Promise<string> {
  const { blob } = encryptEvidence(params.buffer);
  const storagePath = `${params.organizationId}/${params.auditId}/${params.evidenceId}-${sanitizeFileName(
    params.fileName
  )}.enc`;

  const { error } = await supabaseAdmin.storage
    .from(env.EVIDENCE_BUCKET)
    .upload(storagePath, blob, {
      contentType: "application/octet-stream",
      upsert: false,
    });

  if (error) {
    throw new Error(`No se pudo subir la evidencia a Storage: ${error.message}`);
  }

  return storagePath;
}
