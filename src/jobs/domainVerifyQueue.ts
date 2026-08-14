import { Queue } from "bullmq";
import { redisConnectionForQueue } from "../config/redis.js";

export const DOMAIN_VERIFY_QUEUE_NAME = "domain-verify-retries";

export interface DomainVerifyJobData {
  assetId: string;
  organizationId: string;
  /** 1-indexado: qué intento automático es este (1 a DOMAIN_VERIFY_RETRY_DELAYS_MS.length). */
  attempt: number;
}

/**
 * Reintentos automáticos de verificación DNS (a.md, "MVP: REGLAS DE
 * NEGOCIO..." — "hasta 5 reintentos automáticos en segundo plano
 * espaciados para gestionar la propagación DNS" + "mantener la solicitud
 * activa durante 24 horas"). Offsets ACUMULADOS desde que se crea el
 * activo — el primer chequeo no es instantáneo (la propagación de un TXT
 * recién creado casi nunca es inmediata) y el último cae justo en la
 * marca de 24h que pide a.md. El botón manual "Verificar ahora" sigue
 * disponible en paralelo para quien no quiere esperar.
 */
export const DOMAIN_VERIFY_RETRY_DELAYS_MS = [
  5 * 60_000, // intento 1: a los 5 min
  30 * 60_000, // intento 2: a los 30 min
  2 * 60 * 60_000, // intento 3: a las 2h
  6 * 60 * 60_000, // intento 4: a las 6h
  24 * 60 * 60_000, // intento 5: a las 24h
];

export const domainVerifyQueue = new Queue<DomainVerifyJobData>(DOMAIN_VERIFY_QUEUE_NAME, {
  connection: redisConnectionForQueue,
  defaultJobOptions: {
    attempts: 1, // el reintento programado ES el mecanismo de reintento — un fallo de infraestructura acá no se reintenta solo, corre el próximo intento ya agendado
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});
