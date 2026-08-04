# Aegis CyberAudit

Plataforma de auditoría de ciberseguridad para pymes: gestión de activos,
checklist de cumplimiento normativo (ISO 27001 / NIST CSF / GDPR / normativa
local), ingesta y validación de evidencias, motor de escaneo asíncrono, y
generación de reportes ejecutivos con scoring de riesgo.

Backend en `src/` (Node.js + Express + TypeScript), frontend en `frontend/`
(Next.js). Base de datos y autenticación con Supabase (PostgreSQL + Auth +
Storage), cola de trabajos con BullMQ + Redis.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Backend | Node.js, Express 5, TypeScript, ESM |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui |
| Base de datos | PostgreSQL (Supabase), Row Level Security |
| Auth | Supabase Auth (email/password + Google OAuth) |
| Storage | Supabase Storage (evidencias cifradas, reportes con signed URL) |
| Cola de jobs | BullMQ + Redis (Upstash u otro proveedor) |
| Motor de escaneo | Nmap (invocado por el worker) |
| Tests | Jest + Supertest (integración real, sin mocks) |
| i18n | Diccionarios propios (es neutro / en), sin librería externa |

---

## Estructura del repo

```
├── src/                    Backend Express
│   ├── routes/              Un archivo por recurso (audits, assets, evidences, ...)
│   ├── middlewares/          auth (JWT + RBAC + platform admin), validación, errores
│   ├── services/              coverageEngine, riskScoring, pdfReport, fileValidation, ...
│   ├── jobs/                   scanQueue (productor) y scanWorker (consumidor)
│   └── config/                  env.ts (valida .env con zod), supabase.ts, redis.ts
├── db/
│   ├── schema.sql              Esquema inicial (tablas + RLS)
│   ├── migrations/              002, 003, 004... (incrementales)
│   ├── run-migrations.ts       npm run db:migrate — trackea qué ya se aplicó
│   ├── setup-storage.ts        npm run storage:setup — crea los buckets
│   └── promote-admin.ts        npm run admin:promote — otorga platform_admin
├── frontend/                Next.js App Router
│   └── src/
│       ├── app/                 login, register, onboarding, (app)/dashboard, (app)/audits/[id]...
│       ├── components/           shadcn/ui + componentes propios
│       └── lib/i18n/             diccionarios es/en + contexto de idioma
└── tests/                    Suite QA (Jest + Supertest), ver tests/README.md
```

---

## Setup desde cero

### 1. Prerequisitos
- Node.js 20+
- Un proyecto [Supabase](https://supabase.com) (gratis)
- Un Redis accesible por red — recomendado [Upstash](https://upstash.com) (gratis, sin instalar nada)
- Opcional: `nmap` instalado donde vaya a correr el worker de escaneo

### 2. Base de datos y Storage
```bash
npm install
cp .env.example .env        # completar con tus credenciales (ver tabla abajo)
npm run db:migrate           # crea las tablas + RLS
npm run storage:setup        # crea los buckets privados (evidences, reports)
```

### 3. Variables de entorno (`.env`, raíz)

| Variable | De dónde sale |
|---|---|
| `SUPABASE_URL` | Project Settings → API Keys |
| `SUPABASE_ANON_KEY` | Publishable key (o "anon key" legacy) — Project Settings → API Keys |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key (o "service_role key" legacy) — **nunca** exponer al frontend |
| `DATABASE_URL` | Botón "Connect" del proyecto → **Session pooler** (no "Direct connection": requiere IPv6) |
| `REDIS_URL` | De Upstash (u otro proveedor Redis), formato `rediss://...` |
| `EVIDENCE_ENCRYPTION_KEY` | Generar con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CORS_ORIGIN` | URL del frontend, ej. `http://localhost:3001` |

No hace falta ningún "JWT Secret": la validación de sesión se hace contra la
propia API de Supabase (`auth.getUser()`), no localmente.

### 4. Backend
```bash
npm run dev              # API en http://localhost:3000
npm run worker:scan      # aparte, si vas a probar escaneos reales (requiere nmap)
```

### 5. Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local   # NEXT_PUBLIC_SUPABASE_URL/ANON_KEY + NEXT_PUBLIC_API_URL
npm run dev -- --port 3001
```

### 6. Tu cuenta y rol de platform admin (opcional)
```bash
# Después de registrarte una vez en /register:
npm run admin:promote -- tu@email.com
```
No hay ningún botón ni endpoint que otorgue `platform_admin` — es intencional,
para que solo se pueda activar corriendo este script localmente con la
`service_role` key.

### 7. Login con Google (opcional)
Requiere configurar el provider en Supabase (Authentication → Providers →
Google) con credenciales de Google Cloud Console (gratis, no requiere
facturación) y agregar `http://localhost:3001/auth/callback` a las Redirect
URLs de Supabase.

---

## Scripts disponibles

**Backend** (raíz)
| Script | Qué hace |
|---|---|
| `npm run dev` | Levanta la API con recarga automática |
| `npm run build` / `npm start` | Build de producción + arranque |
| `npm run typecheck` | Solo chequeo de tipos |
| `npm run worker:scan` | Worker que consume la cola de escaneos |
| `npm run db:migrate` | Aplica `schema.sql` + migraciones pendientes |
| `npm run storage:setup` | Crea los buckets de Storage si no existen |
| `npm run admin:promote -- email` | Otorga `platform_admin` a un usuario ya registrado |
| `npm test` | Suite QA (necesita un Supabase de test aparte, ver `tests/README.md`) |

**Frontend** (`frontend/`)
| Script | Qué hace |
|---|---|
| `npm run dev` | Dev server de Next.js |
| `npm run build` / `npm start` | Build de producción + arranque |

---

## Arquitectura

### Autenticación y autorización
- El frontend habla con Supabase Auth directamente (email/password y Google
  OAuth) — el backend nunca ve contraseñas.
- Cada request al backend lleva el JWT de sesión como `Authorization: Bearer`.
  El middleware `authenticateToken` lo valida contra `supabase.auth.getUser()`
  (no localmente), así que sigue funcionando sin cambios sin importar qué
  esquema de firma use el proyecto de Supabase.
- **RBAC por organización**: `ciso` (dueño/máximo permiso) > `auditor` >
  `viewer`, definido en `profiles.role`.
- **RLS multi-tenant**: cada tabla filtra por `organization_id` vía
  `current_organization_id()`, así que un usuario nunca ve datos de otra
  organización, ni aunque el backend tuviera un bug — la base de datos misma
  lo bloquea.
- **Platform admin**: rol aparte del RBAC por-org (`profiles.is_platform_admin`),
  ve/administra todas las organizaciones vía `/api/v1/admin/*`. Se otorga con
  `npm run admin:promote` (nunca vía API pública) o, una vez que existe al
  menos un platform admin, desde `/admin` en el frontend (gestión de roles
  de otros usuarios, gateada por `requirePlatformAdmin`).
- **Suspensión de organizaciones**: un platform admin puede suspender una
  organización (`PATCH /admin/organizations/:id/suspend`); sus usuarios
  pierden acceso a la API hasta reactivarla (el propio platform admin nunca
  queda bloqueado por esto).

### Flujo de una auditoría
1. Se crea la auditoría (`POST /audits`) eligiendo un framework.
2. Se cargan evidencias (`POST /audits/:id/evidences`) — validadas en dos
   capas: magic bytes (rechaza binarios disfrazados) y contenido semántico
   (columnas/campos obligatorios según el requisito).
3. Se registran y verifican activos (IP/CIDR/dominio) — un activo no puede
   escanearse hasta probar su propiedad (DNS TXT para dominios, autoatestación
   de rol `ciso` para IP/CIDR).
4. `POST /audits/:id/run-scan` encola un job (BullMQ/Redis); el worker
   (proceso aparte) corre Nmap, además de un chequeo de certificados TLS
   (vencimiento, confianza, protocolo débil) y de cabeceras de seguridad
   HTTP faltantes sobre los puertos web que encuentra abiertos, y normaliza
   todo a `findings` con severidad. Activos tipo repositorio/servidor cloud
   se excluyen del escaneo de red (nmap no aplica a esos tipos).
5. `GET /audits/:id/report` calcula el puntaje de riesgo, genera un PDF, lo
   sube a Storage, y devuelve un signed URL de descarga de corta duración.

### Seguridad
- Evidencias cifradas (AES-256-GCM) antes de subir a Storage.
- Buckets privados; los reportes se sirven vía signed URL temporal.
- Rate limiting específico en acciones sensibles (subir evidencia, lanzar
  escaneo) además del rate limit general.
- Ningún endpoint permite auto-otorgarse organización, rol o `platform_admin`.

---

## API — endpoints principales

Todos bajo `/api/v1`, requieren `Authorization: Bearer <token>` salvo donde se indica.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/users/me` | Perfil del usuario autenticado |
| POST | `/onboarding/organization` | Crea organización + primer perfil (solo requiere token, no perfil previo) |
| POST / GET | `/audits` | Crear / listar auditorías |
| GET / PATCH | `/audits/:id` | Detalle / actualizar auditoría |
| POST | `/audits/:id/evidences` | Subir evidencia (multipart) |
| GET | `/audits/:id/evidences` | Listar evidencias + cobertura actual |
| GET | `/frameworks/:framework/requirements` | Checklist de un framework |
| POST / GET | `/assets` | Crear / listar activos (filtros `?type=&criticality=&tag=`) |
| GET / DELETE | `/assets/:id` | Detalle / eliminar un activo |
| POST | `/assets/:id/verify` | Verificar propiedad de un activo |
| POST | `/audits/:id/run-scan` | Encolar un escaneo asíncrono |
| GET | `/audits/:id/findings` | Hallazgos (filtrable por `?severity=`) |
| GET | `/audits/:id/report` | Genera el reporte y devuelve `{ signedUrl, riskScore, coverage }` |
| GET | `/dashboard/summary` | Métricas agregadas para el dashboard |
| GET | `/admin/organizations` | *(platform admin)* Todas las organizaciones + uso de storage |
| PATCH | `/admin/organizations/:id/suspend` | *(platform admin)* Suspende/reactiva una organización |
| DELETE | `/admin/organizations/:id` | *(platform admin)* Borra una organización |
| GET | `/admin/organizations/:id/members` | *(platform admin)* Usuarios de una organización |
| GET | `/admin/organizations/:id/activity` | *(platform admin)* Actividad reciente |
| POST | `/admin/users/role` | *(platform admin)* Cambia rol y/o `platform_admin` de un usuario |

---

## Frontend — pantallas

| Ruta | Qué hace |
|---|---|
| `/login`, `/register` | Auth (email/password + Google) |
| `/onboarding` | Paso final de registro (crear organización) si todavía no existe el perfil |
| `/dashboard` | Métricas, distribución de riesgos, alta rápida de auditorías |
| `/assets` | Gestión de activos: tabla con filtros, alta/edición, verificación, borrado |
| `/audits/new` | Creación de auditoría con selección múltiple de activos |
| `/audits/[id]` | Matriz de cobertura + carga de evidencias (drag & drop) |
| `/audits/[id]/report` | Hallazgos filtrables por severidad + descarga de PDF |
| `/admin` | *(solo platform admin)* Métricas de plataforma, gestión de organizaciones, roles y actividad |

Selector de idioma (ES neutro / EN) en todas las pantallas, persistido en
`localStorage`.

---

## Limitaciones conocidas / próximos pasos

- No hay pantalla de frontend para lanzar escaneos manualmente desde
  `/audits/[id]` (el endpoint `POST /audits/:id/run-scan` existe, falta el
  botón) — la creación de la auditoría con activos sí está resuelta.
- El worker de escaneo requiere `nmap` instalado donde corra; si no está, la
  auditoría queda en `failed` (no se inventan resultados). Los chequeos de
  TLS/cabeceras HTTP no dependen de nmap.
- El "log de actividad" de `/admin` es una vista basada en los `created_at`
  ya existentes (últimas auditorías/activos/evidencias), no un log de
  auditoría exhaustivo con cada escritura instrumentada.
- La estimación de almacenamiento en `/admin` suma `audit_evidences.size_bytes`
  (ya se guarda por evidencia); no consulta la Management API de Supabase.
- La suite de tests (`npm test`) necesita un proyecto Supabase **de test**
  separado — no se puede correr sin esa infraestructura.
- No hay flujo de "cambiar contraseña" ni "invitar a un compañero de equipo"
  todavía (solo el primer usuario/`ciso` por organización vía onboarding).
