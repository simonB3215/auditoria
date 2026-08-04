import { createHash } from "node:crypto";
import { Worker, type Job } from "bullmq";
import { redisConnectionForWorker } from "../config/redis.js";
import { supabaseAdmin } from "../config/supabase.js";
import { SCAN_QUEUE_NAME, type ScanJobData } from "./scanQueue.js";
import { runNmapScan, checkTlsCertificate, checkSecurityHeaders, isHttpsPort, isHttpLikePort } from "./scanEngine.js";
import {
  normalizeOpenPorts,
  normalizeTlsFindings,
  normalizeHeaderFindings,
  type NormalizedFinding,
} from "../services/findingsNormalization.js";
import { logAuditEvent, AUDIT_ACTIONS } from "../services/auditLogger.js";

const NETWORK_SCANNABLE_TYPES = new Set(["ip", "domain", "cidr"]);

/** Hash de integridad de los hallazgos de un activo — permite comprobar después que un resultado no fue alterado. */
function hashFindings(findings: NormalizedFinding[]): string {
  const canonical = findings
    .map((f) => `${f.source_engine}|${f.title}|${f.severity}|${f.detail}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

async function processScanJob(job: Job<ScanJobData>): Promise<void> {
  const { organizationId, auditId, assets, actorId } = job.data;
  const startedAt = new Date();

  await supabaseAdmin.from("audits").update({ status: "running" }).eq("id", auditId);

  const allFindings: NormalizedFinding[] = [];
  const failures: string[] = [];
  const skipped: string[] = [];

  for (const asset of assets) {
    // repository/cloud_server no son targets de un scan de red (nmap no
    // aplica a una URL de git ni a un identificador de recurso cloud) — un
    // motor de análisis distinto (secret scanning, cloud config audit)
    // queda fuera del alcance de este MVP.
    if (!NETWORK_SCANNABLE_TYPES.has(asset.assetType)) {
      skipped.push(`${asset.assetValue} (tipo ${asset.assetType} no soportado por el motor de red actual)`);
      continue;
    }

    const result = await runNmapScan(asset.assetValue);
    if (!result.ok) {
      failures.push(`${asset.assetValue}: ${result.detail}`);
      continue;
    }

    const assetFindings: NormalizedFinding[] = [...normalizeOpenPorts(auditId, asset.assetId, asset.assetValue, result.openPorts)];

    // Chequeos de TLS/cabeceras solo tienen sentido contra un host puntual
    // (ip/domain), no contra un rango CIDR completo.
    if (asset.assetType !== "cidr") {
      for (const p of result.openPorts) {
        if (isHttpsPort(p.port)) {
          const tlsFindings = await checkTlsCertificate(asset.assetValue, p.port);
          assetFindings.push(...normalizeTlsFindings(auditId, asset.assetId, asset.assetValue, p.port, tlsFindings));
        }
        if (isHttpLikePort(p.port)) {
          const useHttps = isHttpsPort(p.port);
          const headerFindings = await checkSecurityHeaders(asset.assetValue, p.port, useHttps);
          assetFindings.push(
            ...normalizeHeaderFindings(auditId, asset.assetId, asset.assetValue, p.port, useHttps, headerFindings)
          );
        }
      }
    }

    allFindings.push(...assetFindings);

    // Trazabilidad ANCI/ISO 27001 (a.md): un registro inmutable por cada
    // activo efectivamente escaneado, con un hash de integridad del
    // resultado — permite comprobar después que ese resultado no fue
    // alterado, sin necesitar guardar los hallazgos crudos otra vez acá.
    await logAuditEvent({
      organizationId,
      actorId,
      action: AUDIT_ACTIONS.SCAN_EXECUTED,
      resourceType: "scan",
      resourceId: asset.assetId,
      payloadAfter: {
        target: asset.assetValue,
        assetType: asset.assetType,
        scanResultsHash: hashFindings(assetFindings),
        findingsCount: assetFindings.length,
      },
    });
  }

  if (allFindings.length > 0) {
    const { error } = await supabaseAdmin.from("findings").insert(allFindings);
    if (error) {
      await supabaseAdmin.from("audits").update({ status: "failed" }).eq("id", auditId);
      throw new Error(`No se pudieron insertar los hallazgos: ${error.message}`);
    }
  }

  // Si TODOS los activos escaneables fallaron (ej. nmap no disponible), la
  // auditoría se marca como failed en lugar de completed con cero
  // hallazgos, para no dar una falsa sensación de "todo limpio".
  const scannable = assets.filter((a) => NETWORK_SCANNABLE_TYPES.has(a.assetType));
  const allFailed = scannable.length > 0 && failures.length === scannable.length;
  await supabaseAdmin
    .from("audits")
    .update({ status: allFailed ? "failed" : "completed" })
    .eq("id", auditId);

  // Registro de la ejecución para el motor de costos FinOps (src/services/costEngine.ts):
  // sin esto no hay forma de saber cuántas veces se re-escaneó una auditoría
  // ni cuánto "tiempo de worker" consumió.
  const finishedAt = new Date();
  await supabaseAdmin.from("scan_runs").insert({
    audit_id: auditId,
    assets_scanned: scannable.length,
    findings_count: allFindings.length,
    status: allFailed ? "failed" : "completed",
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
  });

  if (failures.length > 0) {
    console.error(`[scan-worker] audit=${auditId} fallos parciales:\n${failures.join("\n")}`);
  }
  if (skipped.length > 0) {
    console.log(`[scan-worker] audit=${auditId} activos omitidos:\n${skipped.join("\n")}`);
  }
  console.log(
    `[scan-worker] audit=${auditId} finalizado: ${allFindings.length} hallazgo(s), ${failures.length} activo(s) con error, ${skipped.length} omitido(s)`
  );
}

export const scanWorker = new Worker<ScanJobData>(SCAN_QUEUE_NAME, processScanJob, {
  connection: redisConnectionForWorker,
  concurrency: 4,
});

scanWorker.on("failed", (job, err) => {
  console.error(`[scan-worker] job ${job?.id} (audit=${job?.data.auditId}) falló: ${err.message}`);
});

console.log("Scan worker escuchando la cola", SCAN_QUEUE_NAME);
