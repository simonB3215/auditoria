import { api, bearer } from "./helpers/apiClient.js";
import { createOrganization, createTestUser, destroyOrganization, destroyTestUser, type TestUser } from "./helpers/tenants.js";
import { supabaseAdmin } from "../src/config/supabase.js";

describe("Módulo 4: Motor de Escaneo, Hallazgos y Generación de Reportes", () => {
  let orgId: string;
  let ciso: TestUser;
  let assetId: string;
  let auditId: string;

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
  }, 30000);

  afterAll(async () => {
    await destroyTestUser(ciso);
    await destroyOrganization(orgId);
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
