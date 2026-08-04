import { Queue } from "bullmq";
import { redisConnectionForQueue } from "../config/redis.js";

export const RETENTION_QUEUE_NAME = "retention-purge";

export const retentionQueue = new Queue(RETENTION_QUEUE_NAME, {
  connection: redisConnectionForQueue,
});

const DAILY_MS = 24 * 60 * 60 * 1000;

/**
 * Registra el job repetible de purga diaria vía Job Scheduler (API de
 * BullMQ 6 — reemplaza el viejo `queue.add(..., {repeat})`). Un id fijo
 * hace que llamar esto de nuevo (ej. al reiniciar el worker) actualice el
 * mismo scheduler en vez de acumular duplicados.
 */
export async function scheduleRetentionJob(): Promise<void> {
  await retentionQueue.upsertJobScheduler("daily-retention-purge", { every: DAILY_MS }, { name: "purge" });
}
