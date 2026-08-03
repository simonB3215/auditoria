# Suite de pruebas (QA) — Aegis CyberAudit

Cubre los 12 casos de prueba de `a.md` (auth/RBAC, aislamiento multi-tenant
vía RLS, ingesta de evidencias, escaneo y reportes) con Jest + Supertest.

## Prerequisitos OBLIGATORIOS

Estos tests son de **integración real**, no usan mocks de Supabase: crean
organizaciones/usuarios reales, insertan filas y las borran al final. Para
correrlos necesitás:

1. **Un proyecto Supabase dedicado a testing** (nunca el de desarrollo o
   producción — los tests crean y BORRAN usuarios/datos reales).
   - Ejecutar `db/schema.sql` y `db/migrations/002_asset_verification.sql` en ese proyecto.
2. **Redis corriendo** (ej. `docker run -p 6379:6379 redis`), requerido por
   TC-10 (encolado real de un job en BullMQ).
3. Copiar `.env.test.example` a `.env.test` y completar las credenciales del
   proyecto de test.

Sin estos tres elementos, la mayoría de los tests van a fallar en sus hooks
`beforeAll` (no en las aserciones) — eso es esperado y no indica un bug en
el código de la API.

## Cómo correr

```
npm test
```

## Qué NO cubre esta suite

- **No ejecuta un escaneo Nmap real.** TC-10 solo verifica que la API
  encole el job correctamente (`202` + `jobId`). Ningún worker corre
  durante `npm test`, así que nunca se escanea de verdad ningún host. La
  ejecución real del motor de escaneo se validó por separado con smoke
  tests manuales durante el desarrollo de la Fase 3.
- **No reemplaza pruebas de carga/rendimiento.**

## Desviaciones documentadas respecto al spec original de `a.md`

- **TC-08**: el spec esperaba `400 Bad Request`; la implementación real
  devuelve `422 Unprocessable Entity` (más preciso semánticamente para
  "contenido de archivo inválido"). El test asume `422`.
- **TC-09**: el spec menciona una tabla `validation_logs`; en esta
  implementación los errores se guardan inline en la columna
  `audit_evidences.validation_errors` (jsonb). El test valida contra esa
  columna.
- **TC-12**: el endpoint `GET /audits/:id/report` se modificó (a pedido
  explícito, ver historial de la conversación) para devolver JSON con un
  `signedUrl` de corta duración en vez de streamear el PDF binario
  directamente.
