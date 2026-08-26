import { randomUUID } from "node:crypto";
import { api, bearer } from "./helpers/apiClient.js";
import { createOrganization, createTestUser, destroyOrganization, destroyTestUser, type TestUser } from "./helpers/tenants.js";
import { supabaseAdmin } from "../src/config/supabase.js";

describe("Módulo 4: Motor de Escaneo, Hallazgos y Generación de Reportes", () => {
  let orgId: string;
  let ciso: TestUser;
  let assetId: string;
  let auditId: string;

  // Segunda organización, solo para TC-13 (security gate de la Fase 2.3 de
  // la auditoría pre-venta): necesita un activo real que exista en la BD
  // pero NO pertenezca a `orgId`, para distinguir "ajeno" de "inexistente".
  let orgBId: string;
  let cisoB: TestUser;
  let foreignAssetId: string;
  // Auditoría propia para TC-13, separada de `auditId`: TC-10 ya deja
  // `auditId` en estado "queued", y run-scan rechaza con 409 si el audit ya
  // tiene un escaneo en curso — necesitamos llegar limpio hasta el chequeo
  // de propiedad de activos, no que un guard anterior lo tape.
  let securityGateAuditId: string;

  beforeAll(async () => {
    orgId = await createOrganization("QA Org - Scan & Report");
    ciso = await createTestUser(orgId, "ciso-scan", "ciso");

    // 203.0.113.0/24 está reservado para documentación (RFC 5737): nunca se
    // enruta en Internet real. Se usa acá porque TC-10 solo verifica que la
    // API encole el job correctamente (202 + jobId) — ningún worker corre
    // durante `npm test`, así que nunca se ejecuta un escaneo real contra
    // esta IP ni contra ningún otro host.
    const assetRes = await api
      .post("/api/v1/assets")
      .set("Authorization", bearer(ciso.accessToken))
      .send({ type: "ip", value: "203.0.113.10" });
    assetId = assetRes.body.data.id;

    // Verificación IP/CIDR = autoatestación de rol ciso (ver assets.ts), sin dependencias externas.
    await api.post(`/api/v1/assets/${assetId}/verify`).set("Authorization", bearer(ciso.accessToken));

    const auditRes = await api
      .post("/api/v1/audits")
      .set("Authorization", bearer(ciso.accessToken))
      .send({ title: "Auditoría Scan & Report - QA", framework: "iso27001" });
    auditId = auditRes.body.data.id;

    orgBId = await createOrganization("QA Org B - Scan Security Gate");
    cisoB = await createTestUser(orgBId, "ciso-scan-b", "ciso");
    const foreignAssetRes = await api
      .post("/api/v1/assets")
      .set("Authorization", bearer(cisoB.accessToken))
      .send({ type: "ip", value: "203.0.113.20" });
    foreignAssetId = foreignAssetRes.body.data.id;
    await api.post(`/api/v1/assets/${foreignAssetId}/verify`).set("Authorization", bearer(cisoB.accessToken));

    const securityGateAuditRes = await api
      .post("/api/v1/audits")
      .set("Authorization", bearer(ciso.accessToken))
      .send({ title: "Auditoría Security Gate - QA", framework: "iso27001" });
    securityGateAuditId = securityGateAuditRes.body.data.id;
  }, 30000);

  afterAll(async () => {
    await destroyTestUser(ciso);
    await destroyOrganization(orgId);
    await destroyTestUser(cisoB);
    await destroyOrganization(orgBId);
  }, 30000);

  test("TC-10: POST /audits/:id/run-scan encola el job de forma asíncrona (202 + jobId)", async () => {
    const res = await api
      .post(`/api/v1/audits/${auditId}/run-scan`)
      .set("Authorization", bearer(ciso.accessToken))
      .send({ asset_ids: [assetId] });

    expect(res.status).toBe(202);
    expect(res.body.data.jobId).toBeTruthy();
    expect(res.body.data.status).toBe("queued");
    // Nota de alcance: este test verifica el contrato async de la API
    // (encolado real en BullMQ/Redis), no el resultado de un escaneo Nmap
    // real — eso depende de un worker corriendo por separado (npm run worker:scan)
    // y está cubierto por los smoke tests manuales de src/jobs/scanEngine.ts.
  }, 15000);

  test("TC-13: run-scan con un asset_id ajeno o inexistente → 403 sin distinguir el caso, y queda auditado", async () => {
    // Caso A: el activo existe de verdad, pero es de OTRA organización.
    const foreignRes = await api
      .post(`/api/v1/audits/${securityGateAuditId}/run-scan`)
      .set("Authorization", bearer(ciso.accessToken))
      .send({ asset_ids: [foreignAssetId] });

    expect(foreignRes.status).toBe(403);
    expect(foreignRes.body.error.code).toBe("UNAUTHORIZED_SCAN_TARGET");

    // Caso B: el id ni siquiera existe en la BD.
    const missingAssetId = randomUUID();
    const missingRes = await api
      .post(`/api/v1/audits/${securityGateAuditId}/run-scan`)
      .set("Authorization", bearer(ciso.accessToken))
      .send({ asset_ids: [missingAssetId] });

    expect(missingRes.status).toBe(403);
    expect(missingRes.body.error.code).toBe("UNAUTHORIZED_SCAN_TARGET");

    // No debe filtrarse la distinción entre "ajeno" y "no existe": misma
    // respuesta (código y mensaje) para ambos casos.
    expect(missingRes.body.error.message).toBe(foreignRes.body.error.message);

    // El audit no debe haber quedado "queued" por ninguno de los dos intentos
    // bloqueados (la actualización de estado ocurre después del chequeo de
    // propiedad, que en ambos casos aborta antes).
    const auditStateRes = await api
      .get(`/api/v1/audits/${securityGateAuditId}`)
      .set("Authorization", bearer(ciso.accessToken));
    expect(auditStateRes.body.data.status).toBe("draft");

    // Ambos intentos deben quedar registrados en audit_logs
    // (UNAUTHORIZED_SCAN_BLOCKED), con el id correspondiente en el payload —
    // audit_logs no tiene policy de SELECT para `authenticated`, se consulta
    // con service_role, igual que en el resto de la suite.
    const { data: logs, error: logsError } = await supabaseAdmin
      .from("audit_logs")
      .select("action, payload_after")
      .eq("resource_id", securityGateAuditId)
      .eq("action", "UNAUTHORIZED_SCAN_BLOCKED")
      .order("created_at", { ascending: true });

    expect(logsError).toBeNull();
    expect(logs).toHaveLength(2);

    const loggedIds = (logs ?? []).map(
      (log) => (log.payload_after as { notOwnedOrMissingAssetIds?: string[] })?.notOwnedOrMissingAssetIds ?? []
    );
    expect(loggedIds[0]).toEqual([foreignAssetId]);
    expect(loggedIds[1]).toEqual([missingAssetId]);
  }, 20000);

  test("TC-11: un hallazgo crítico penaliza correctamente el puntaje de riesgo", async () => {
    // Simula la salida que insertaría el worker tras un escaneo real,
    // sin depender de Nmap ni de red real.
    const { error } = await supabaseAdmin.from("findings").insert({
      audit_id: auditId,
      source_engine: "nmap",
      title: "Telnet expuesto (fixture de test)",
      severity: "critical",
      detail: "Puerto 23 abierto",
      remediation: "Deshabilitar Telnet",
    });
    expect(error).toBeNull();

    const res = await api
      .get(`/api/v1/audits/${auditId}/report`)
      .set("Authorization", bearer(ciso.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.riskScore.findingsPenalty).toBeGreaterThanOrEqual(20); // peso 'critical' = 20
    expect(res.body.data.riskScore.score).toBeLessThan(100);
  }, 20000);

  test("TC-12: el reporte se devuelve como JSON con un link firmado a un PDF real", async () => {
    const res = await api
      .get(`/api/v1/audits/${auditId}/report`)
      .set("Authorization", bearer(ciso.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.data.signedUrl).toEqual(expect.stringMatching(/^https?:\/\//));
    expect(res.body.data.expiresInSeconds).toBeGreaterThan(0);

    const pdfResponse = await fetch(res.body.data.signedUrl);
    expect(pdfResponse.status).toBe(200);
    const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
    const header = Buffer.from(pdfBytes.slice(0, 5)).toString("ascii");
    expect(header).toBe("%PDF-");
  }, 20000);
});
