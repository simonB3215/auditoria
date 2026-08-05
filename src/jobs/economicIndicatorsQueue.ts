import { Queue } from "bullmq";
import { redisConnectionForQueue } from "../config/redis.js";

export const ECONOMIC_INDICATORS_QUEUE_NAME = "economic-indicators-refresh";

export const economicIndicatorsQueue = new Queue(ECONOMIC_INDICATORS_QUEUE_NAME, {
  connection: redisConnectionForQueue,
});

/**
 * a.md pide un Cron Job diario a las 08:00 AM "vía Vercel Cron o pg_cron" —
 * este proyecto no corre en Vercel y no usa la extensión pg_cron de
 * Postgres; se adapta al mismo mecanismo de scheduling que ya usa la purga
 * de retención (BullMQ Job Scheduler, ver retentionQueue.ts) para no
 * introducir una segunda forma de programar tareas. Un id fijo hace que
 * reiniciar el worker actualice el mismo scheduler en vez de duplicarlo.
 */
export async function scheduleEconomicIndicatorsRefresh(): Promise<void> {
  await economicIndicatorsQueue.upsertJobScheduler(
    "daily-economic-indicators-refresh",
    { pattern: "0 8 * * *", tz: "America/Santiago" },
    { name: "refresh" }
  );
}
