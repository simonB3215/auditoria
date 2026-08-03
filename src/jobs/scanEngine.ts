import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface OpenPort {
  port: number;
  protocol: "tcp" | "udp";
  service: string;
}

export type ScanEngineResult =
  | { ok: true; openPorts: OpenPort[] }
  | { ok: false; reason: "engine_not_available" | "scan_failed"; detail: string };

/**
 * Ejecuta un escaneo de puertos con Nmap contra un target ya validado
 * (IP / CIDR / dominio verificado — ver assets.ts). Usa execFile con args
 * en array (nunca interpolación de shell) para eliminar el riesgo de
 * inyección de comandos vía el valor del activo.
 *
 * Nota de alcance del MVP: solo se detectan puertos abiertos + servicio
 * asociado (banner grabbing básico de Nmap, `-sV`). Detección de cifrados
 * débiles (`--script ssl-enum-ciphers`) y de parches faltantes (NSE `vuln`
 * scripts / integración con Nuclei) queda fuera de este MVP y se deja como
 * punto de extensión de ScanEngineResult.
 */
export async function runNmapScan(target: string): Promise<ScanEngineResult> {
  try {
    const { stdout } = await execFileAsync(
      "nmap",
      ["-Pn", "-T4", "--top-ports", "100", "-sV", "-oG", "-", target],
      { timeout: 5 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 }
    );
    return { ok: true, openPorts: parseGrepableOutput(stdout) };
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      return {
        ok: false,
        reason: "engine_not_available",
        detail:
          "El binario 'nmap' no está instalado en este worker. Instalar Nmap o desplegar el worker en la imagen que lo incluye.",
      };
    }
    return { ok: false, reason: "scan_failed", detail: nodeErr.message ?? "Error desconocido ejecutando nmap" };
  }
}

/** Parsea la salida "grepable" de nmap (-oG -). */
function parseGrepableOutput(output: string): OpenPort[] {
  const ports: OpenPort[] = [];
  const portsLineRegex = /Ports:\s*(.+?)(?:\tIgnored State|\n|$)/;

  for (const line of output.split("\n")) {
    if (!line.startsWith("Host:") || !line.includes("Ports:")) continue;

    const match = portsLineRegex.exec(line);
    if (!match) continue;

    for (const entry of match[1].split(",")) {
      const fields = entry.trim().split("/");
      // formato: puerto/estado/protocolo/owner/servicio/rpc-info/version
      const [portStr, state, protocol, , service] = fields;
      if (state !== "open") continue;
      const port = Number(portStr);
      if (!Number.isInteger(port)) continue;

      ports.push({
        port,
        protocol: protocol === "udp" ? "udp" : "tcp",
        service: service && service.length > 0 ? service : "desconocido",
      });
    }
  }

  return ports;
}
