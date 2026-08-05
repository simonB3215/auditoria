import { Worker } from "bullmq";
import { redisConnectionForWorker } from "../config/redis.js";
import { ECONOMIC_INDICATORS_QUEUE_NAME, scheduleEconomicIndicatorsRefresh } from "./economicIndicatorsQueue.js";
import { refreshEconomicIndicators } from "../services/economicIndicators.js";

const worker = new Worker(
  ECONOMIC_INDICATORS_QUEUE_NAME,
  async () => {
    const result = await refreshEconomicIndicators();
    if (!result) {
      console.error("[economic-indicators-worker] Mindicador.cl no respondió — se mantiene el último valor guardado");
      return;
    }
    console.log(
      `[economic-indicators-worker] refrescado: UF=${result.ufValue} UTM=${result.utmValue} USD=${result.dolarValue}`
    );
  },
  { connection: redisConnectionForWorker }
);

worker.on("failed", (job, err) => {
  console.error(`[economic-indicators-worker] job ${job?.id} falló: ${err.message}`);
});

await scheduleEconomicIndicatorsRefresh();
console.log(
  "Economic indicators worker escuchando la cola",
  ECONOMIC_INDICATORS_QUEUE_NAME,
  "— refresco programado todos los días a las 08:00 (America/Santiago)"
);
