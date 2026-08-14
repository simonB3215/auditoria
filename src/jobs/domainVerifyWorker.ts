import { resolveTxt } from "node:dns/promises";
import { Worker, type Job } from "bullmq";
import { redisConnectionForWorker } from "../config/redis.js";
import { supabaseAdmin } from "../config/supabase.js";
import { logAuditEvent, AUDIT_ACTIONS } from "../services/auditLogger.js";
import {
  domainVerifyQueue,
  DOMAIN_VERIFY_QUEUE_NAME,
  DOMAIN_VERIFY_RETRY_DELAYS_MS,
  type DomainVerifyJobData,
} from "./domainVerifyQueue.js";

async function processDomainVerifyJob(job: Job<DomainVerifyJobData>): Promise<void> {
  const { assetId, organizationId, attempt } = job.data;

  const { data: asset } = await supabaseAdmin
    .from("assets")
    .select("id, type, value, verification_token, verification_status")
    .eq("id", assetId)
    .maybeSingle();

  // El activo se borró, o ya se verificó por otra vía (el botón manual
  // "Verificar ahora", o un intento automático anterior) — nada que hacer,
  // y no se reprograma un intento más.
  if (!asset || asset.type !== "domain" || asset.verification_status === "verified") {
    return;
  }

  const expected = `aegis-site-verification=${asset.verification_token}`;
  let verified = false;
  try {
    const records = await resolveTxt(asset.value);
    verified = records.some((chunks) => chunks.join("").trim() === expected);
  } catch {
    verified = false;
  }

  if (verified) {
    await supabaseAdmin
      .from("assets")
      .update({ verification_status: "verified", verified_at: new Date().toISOString() })
      .eq("id", assetId);
    await logAuditEvent({
      organizationId,
      actorId: null,
      action: AUDIT_ACTIONS.DOMAIN_AUTO_VERIFIED,
      resourceType: "asset",
      resourceId: assetId,
      payloadAfter: { domain: asset.value, attempt },
    });
    console.log(`[domain-verify-worker] asset=${assetId} verificado automáticamente en el intento ${attempt}`);
    return;
  }

  if (attempt < DOMAIN_VERIFY_RETRY_DELAYS_MS.length) {
    const nextAttempt = attempt + 1;
    const delay = DOMAIN_VERIFY_RETRY_DELAYS_MS[nextAttempt - 1] - DOMAIN_VERIFY_RETRY_DELAYS_MS[attempt - 1];
    await domainVerifyQueue.add("retry-verify", { assetId, organizationId, attempt: nextAttempt }, { delay });
    console.log(
      `[domain-verify-worker] asset=${assetId} intento ${attempt} sin éxito todavía, reprogramado el intento ${nextAttempt}`
    );
  } else {
    console.log(
      `[domain-verify-worker] asset=${assetId} agotó los ${DOMAIN_VERIFY_RETRY_DELAYS_MS.length} intentos automáticos en 24h — queda pendiente de verificación manual`
    );
  }
}

export const domainVerifyWorker = new Worker<DomainVerifyJobData>(DOMAIN_VERIFY_QUEUE_NAME, processDomainVerifyJob, {
  connection: redisConnectionForWorker,
  concurrency: 4,
});

domainVerifyWorker.on("failed", (job, err) => {
  console.error(`[domain-verify-worker] job ${job?.id} (asset=${job?.data.assetId}) falló:`, err.message);
});

console.log("Domain verify worker escuchando la cola", DOMAIN_VERIFY_QUEUE_NAME);
