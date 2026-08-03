import { isIP } from "node:net";
import { z } from "zod";

const DOMAIN_REGEX =
  /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

function isValidCidr(value: string): boolean {
  const [address, prefix] = value.split("/");
  if (!address || prefix === undefined) return false;
  if (isIP(address) !== 4) return false; // MVP: solo IPv4 CIDR
  const prefixNum = Number(prefix);
  return Number.isInteger(prefixNum) && prefixNum >= 0 && prefixNum <= 32;
}

export const assetInputSchema = z
  .object({
    type: z.enum(["ip", "cidr", "domain"]),
    value: z.string().trim().min(1).max(253),
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
  });

export type AssetInput = z.infer<typeof assetInputSchema>;
