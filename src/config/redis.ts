import { Redis } from "ioredis";
import { env } from "./env.js";

/**
 * Conexión para el productor (API: `scanQueue.add()`). A propósito NO usa
 * maxRetriesPerRequest: null — si Redis está caído, un comando falla rápido
 * (en vez de reintentar para siempre) para no colgar la request HTTP.
 */
export const redisConnectionForQueue = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  connectTimeout: 2000,
  // Fuerza IPv4: en algunos entornos Windows la resolución de "localhost" a
  // ::1 (IPv6) se queda esperando un timeout largo en vez de rechazar al
  // instante como 127.0.0.1, lo que hacía la conexión fallida mucho más lenta
  // e impredecible de lo que sugiere connectTimeout.
  family: 4,
  retryStrategy: (attempt) => (attempt > 3 ? null : Math.min(attempt * 200, 1000)),
});

/**
 * Conexión para el Worker. BullMQ exige maxRetriesPerRequest: null acá
 * porque el Worker usa comandos bloqueantes (BRPOPLPUSH) que no deben
 * abortarse por un límite de reintentos a nivel de comando.
 */
export const redisConnectionForWorker = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  family: 4,
});
