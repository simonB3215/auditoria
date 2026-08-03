import { api, bearer } from "./helpers/apiClient.js";
import {
  createOrganization,
  createTestUser,
  destroyOrganization,
  destroyTestUser,
  type TestUser,
} from "./helpers/tenants.js";

describe("Módulo 2: Aislamiento Multitenant (RLS en Supabase)", () => {
  let orgAId: string;
  let orgBId: string;
  let cisoA: TestUser;
  let cisoB: TestUser;
  let assetAId: string;
  let auditAId: string;

  beforeAll(async () => {
    orgAId = await createOrganization("QA Org A - RLS");
    orgBId = await createOrganization("QA Org B - RLS");
    cisoA = await createTestUser(orgAId, "ciso-a-rls", "ciso");
    cisoB = await createTestUser(orgBId, "ciso-b-rls", "ciso");

    const assetRes = await api
      .post("/api/v1/assets")
      .set("Authorization", bearer(cisoA.accessToken))
      .send({ type: "domain", value: "activo-tenant-a.example.com" });
    expect(assetRes.status).toBe(201);
    assetAId = assetRes.body.data.id;

    const auditRes = await api
      .post("/api/v1/audits")
      .set("Authorization", bearer(cisoA.accessToken))
      .send({ title: "Auditoría confidencial de Tenant A", framework: "iso27001" });
    expect(auditRes.status).toBe(201);
    auditAId = auditRes.body.data.id;
  }, 30000);

  afterAll(async () => {
    await Promise.all([destroyTestUser(cisoA), destroyTestUser(cisoB)]);
    await Promise.all([destroyOrganization(orgAId), destroyOrganization(orgBId)]);
  }, 30000);

  test("TC-05: Tenant B no puede leer un activo de Tenant A (404, no filtra su existencia)", async () => {
    const res = await api
      .get(`/api/v1/assets/${assetAId}`)
      .set("Authorization", bearer(cisoB.accessToken));
    expect(res.status).toBe(404);

    // Control: el propio dueño sí puede leerlo.
    const ownRes = await api
      .get(`/api/v1/assets/${assetAId}`)
      .set("Authorization", bearer(cisoA.accessToken));
    expect(ownRes.status).toBe(200);
  });

  test("TC-06: Tenant B no puede modificar una auditoría de Tenant A (bloqueado por RLS -> 404)", async () => {
    const res = await api
      .patch(`/api/v1/audits/${auditAId}`)
      .set("Authorization", bearer(cisoB.accessToken))
      .send({ title: "Auditoría secuestrada por Tenant B" });
    expect(res.status).toBe(404);

    // Confirma que el título NO cambió: la lectura del dueño sigue viendo el original.
    const verifyRes = await api
      .get(`/api/v1/audits/${auditAId}`)
      .set("Authorization", bearer(cisoA.accessToken));
    expect(verifyRes.body.data.title).toBe("Auditoría confidencial de Tenant A");
  });
});
