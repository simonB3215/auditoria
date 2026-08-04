import { isIP } from "node:net";
import { z } from "zod";

const DOMAIN_REGEX =
  /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

// https://host/org/repo(.git)? o git@host:org/repo.git
const REPOSITORY_REGEX = /^(https?:\/\/[^\s]+\/[^\s]+|git@[^\s:]+:[^\s]+)$/;

// Identificador genérico de cloud (ARN, instance-id, FQDN...): no hay un
// formato único, así que se valida de forma laxa (longitud + caracteres
// imprimibles) — simplificación conocida del MVP.
const CLOUD_SERVER_REGEX = /^[\x20-\x7E]{3,253}$/;

function isValidCidr(value: string): boolean {
  const [address, prefix] = value.split("/");
  if (!address || prefix === undefined) return false;
  if (isIP(address) !== 4) return false; // MVP: solo IPv4 CIDR
  const prefixNum = Number(prefix);
  return Number.isInteger(prefixNum) && prefixNum >= 0 && prefixNum <= 32;
}

export const ASSET_CRITICALITIES = ["critica", "alta", "media", "baja"] as const;
export type AssetCriticality = (typeof ASSET_CRITICALITIES)[number];

export const ASSET_TYPES = ["ip", "cidr", "domain", "repository", "cloud_server"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const assetInputSchema = z
  .object({
    type: z.enum(ASSET_TYPES),
    value: z.string().trim().min(1).max(253),
    criticality: z.enum(ASSET_CRITICALITIES).default("media"),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.type === "ip" && isIP(data.value) === 0) {
      ctx.addIssue({ code: "custom", message: "El valor no es una dirección IP válida (IPv4/IPv6)" });
    }
    if (data.type === "cidr" && !isValidCidr(data.value)) {
      ctx.addIssue({ code: "custom", message: "El valor no es un rango CIDR IPv4 válido (ej: 10.0.0.0/24)" });
    }
    if (data.type === "domain" && !DOMAIN_REGEX.test(data.value)) {
      ctx.addIssue({ code: "custom", message: "El valor no es un dominio válido (ej: ejemplo.com)" });
    }
    if (data.type === "repository" && !REPOSITORY_REGEX.test(data.value)) {
      ctx.addIssue({
        code: "custom",
        message: "El valor no es una URL de repositorio válida (ej: https://github.com/org/repo)",
      });
    }
    if (data.type === "cloud_server" && !CLOUD_SERVER_REGEX.test(data.value)) {
      ctx.addIssue({ code: "custom", message: "El identificador de servidor cloud no es válido" });
    }
  });

export type AssetInput = z.infer<typeof assetInputSchema>;
