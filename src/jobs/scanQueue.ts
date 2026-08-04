import { Queue } from "bullmq";
import { redisConnectionForQueue } from "../config/redis.js";

export const SCAN_QUEUE_NAME = "scan-jobs";

export interface ScanTargetAsset {
  assetId: string;
  assetType: "ip" | "cidr" | "domain" | "repository" | "cloud_server";
  assetValue: string;
}

export interface ScanJobData {
  organizationId: string;
  auditId: string;
  assets: ScanTargetAsset[];
  /** Quién disparó el escaneo — se usa para atribuir el evento SCAN_EXECUTED en audit_logs. */
  actorId: string;
}

export const scanQueue = new Queue<ScanJobData>(SCAN_QUEUE_NAME, {
  connection: redisConnectionForQueue,
  defaultJobOptions: {
    attempts: 1, // un escaneo fallido no se reintenta automáticamente: requiere revisión (ver audits.status = 'failed')
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});
