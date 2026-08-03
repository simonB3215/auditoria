import { api, bearer } from "./helpers/apiClient.js";
import {
  createOrganization,
  createTestUser,
  destroyOrganization,
  destroyTestUser,
  type TestUser,
} from "./helpers/tenants.js";

describe("Módulo 1: Autenticación, Sesión y Control de Accesos (RBAC)", () => {
  let orgAId: string;
  let orgBId: string;
  let tenantA: TestUser; // rol ciso, org A
  let tenantB: TestUser; // rol ciso, org B
  let viewerA: TestUser; // rol viewer, MISMA org que tenantA (para probar RBAC, no aislamiento)

  beforeAll(async () => {
    orgAId = await createOrganization("QA Org A - Auth");
    orgBId = await createOrganization("QA Org B - Auth");
    tenantA = await createTestUser(orgAId, "tenant-a", "ciso");
    tenantB = await createTestUser(orgBId, "tenant-b", "ciso");
    viewerA = await createTestUser(orgAId, "viewer-a", "viewer");
  }, 30000);

  afterAll(async () => {
    await Promise.all([
      destroyTestUser(tenantA),
      destroyTestUser(tenantB),
      destroyTestUser(viewerA),
    ]);
    await Promise.all([destroyOrganization(orgAId), destroyOrganization(orgBId)]);
  }, 30000);

  test("TC-01/TC-02: registro y login de dos inquilinos devuelven un JWT Bearer válido y utilizable", async () => {
    expect(tenantA.accessToken).toBeTruthy();
    expect(tenantB.accessToken).toBeTruthy();

    const resA = await api.get("/api/v1/users/me").set("Authorization", bearer(tenantA.accessToken));
    expect(resA.status).toBe(200);
    expect(resA.body.data.organizationId).toBe(orgAId);

    const resB = await api.get("/api/v1/users/me").set("Authorization", bearer(tenantB.accessToken));
    expect(resB.status).toBe(200);
    expect(resB.body.data.organizationId).toBe(orgBId);
  });

  test("TC-03: bloquea solicitudes no autenticadas a /api/v1/audits (401)", async () => {
    const res = await api.get("/api/v1/audits");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  test("TC-04: un rol 'viewer' no puede crear activos ni lanzar un escaneo (403)", async () => {
    const createAssetRes = await api
      .post("/api/v1/assets")
      .set("Authorization", bearer(viewerA.accessToken))
      .send({ type: "domain", value: "no-deberia-crearse.example.com" });
    expect(createAssetRes.status).toBe(403);
    expect(createAssetRes.body.error.code).toBe("FORBIDDEN");

    const runScanRes = await api
      .post("/api/v1/audits/00000000-0000-0000-0000-000000000000/run-scan")
      .set("Authorization", bearer(viewerA.accessToken))
      .send({});
    expect(runScanRes.status).toBe(403);
  });
});
