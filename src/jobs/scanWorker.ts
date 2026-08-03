import { Worker, type Job } from "bullmq";
import { redisConnection } from "../config/redis.js";
import { supabaseAdmin } from "../config/supabase.js";
import { SCAN_QUEUE_NAME, type ScanJobData } from "./scanQueue.js";
import { runNmapScan } from "./scanEngine.js";
import { normalizeOpenPorts, type NormalizedFinding } from "../services/findingsNormalization.js";

async function processScanJob(job: Job<ScanJobData>): Promise<void> {
  const { auditId, assets } = job.data;

  await supabaseAdmin.from("audits").update({ status: "running" }).eq("id", auditId);

  const allFindings: NormalizedFinding[] = [];
  const failures: string[] = [];

  for (const asset of assets) {
    const result = await runNmapScan(asset.assetValue);
    if (!result.ok) {
      failures.push(`${asset.assetValue}: ${result.detail}`);
      continue;
    }
    allFindings.push(...normalizeOpenPorts(auditId, asset.assetId, asset.assetValue, result.openPorts));
  }

  if (allFindings.length > 0) {
    const { error } = await supabaseAdmin.from("findings").insert(allFindings);
    if (error) {
      await supabaseAdmin.from("audits").update({ status: "failed" }).eq("id", auditId);
      throw new Error(`No se pudieron insertar los hallazgos: ${error.message}`);
    }
  }

  // Si TODOS los activos fallaron (ej. nmap no disponible), la auditoría
  // se marca como failed en lugar de completed con cero hallazgos, para no
  // dar una falsa sensación de "todo limpio".
  const allFailed = failures.length === assets.length && assets.length > 0;
  await supabaseAdmin
    .from("audits")
    .update({ status: allFailed ? "failed" : "completed" })
    .eq("id", auditId);

  if (failures.length > 0) {
    console.error(`[scan-worker] audit=${auditId} fallos parciales:\n${failures.join("\n")}`);
  }
  console.log(
    `[scan-worker] audit=${auditId} finalizado: ${allFindings.length} hallazgo(s), ${failures.length} activo(s) con error`
  );
}

export const scanWorker = new Worker<ScanJobData>(SCAN_QUEUE_NAME, processScanJob, {
  connection: redisConnection,
  concurrency: 4,
});

scanWorker.on("failed", (job, err) => {
  console.error(`[scan-worker] job ${job?.id} (audit=${job?.data.auditId}) falló: ${err.message}`);
});

console.log("Scan worker escuchando la cola", SCAN_QUEUE_NAME);
