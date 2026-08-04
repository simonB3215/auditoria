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
│   ├── services/              coverageEngine, riskScoring, pdfReport, fileValidation, costEngine, auditLogger, dataRetentionEngine, ...
│   ├── jobs/                   scanQueue/scanWorker y retentionQueue/retentionWorker (productor/consumidor)
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
| `npm run worker:retention` | Worker que purga evidencias vencidas (corre diario vía BullMQ Job Scheduler; también se puede disparar manual con `POST /admin/retention/run-now`) |
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
  `viewer`, definido en `profiles.role`. `auditor_guest` ("Piloto Invitado")
  es un quinto rol especial de solo 10 días — ver sección propia abajo.
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

### Piloto Invitado (10 días)
- Un **platform admin** genera un link desde `/settings/team` (restringido
  a `requirePlatformAdmin`, no a cualquier `ciso`: dar de alta acceso a una
  organización se trata con el mismo nivel de privilegio que el resto de
  `/admin/*`), marcando "Acceso Temporal (10 Días)". El **email es
  opcional** — no hace falta saber de antemano quién va a usar el link, ni
  depender de que le llegue un correo: el token (`invite_links.id`, UUID no
  adivinable, un solo uso, vence en 7 días si nadie lo usa) alcanza para
  unirse desde `/register?invite=<token>`, donde la persona se registra con
  el email y contraseña que quiera — no tiene que coincidir con ningún
  email que el admin haya escrito. La organización y el rol de destino se
  resuelven del lado del servidor contra `invite_links` al aceptar (nunca
  se confía en lo que diga el cliente); recién ahí se crea el `profiles` y
  se cuentan los 10 días — un link sin usar no gasta días de prueba.
- **Degradación autónoma**: no depende de un job para bajar de nivel. En
  cuanto `expires_at` vence, la siguiente request autenticada de ese
  usuario lo baja a `viewer` en el momento (`authenticateToken`), antes de
  seguir procesando esa misma request. La policy de RLS que exige
  `expires_at > now()` para escribir es la red de seguridad para la
  ventana entre que expira y esa próxima request.
- **Cuotas FinOps del trial**: máximo 3 escaneos y 100MB de almacenamiento
  por organización durante los 10 días (no por usuario), devuelto como 403
  si se supera — ver `POST /audits/:id/run-scan` y
  `POST /audits/:id/evidences`.
- **UI**: badge en el topbar con los días restantes mientras está activo;
  al expirar, "Cargar evidencia", "Ejecutar escaneo" y las acciones sobre
  hallazgos quedan visualmente deshabilitadas con un aviso puntual para
  actualizar a Plan Pro, en vez de simplemente desaparecer.
- **Secuencia de nurturing (día 1/7/10)**: las 3 plantillas de email están
  preparadas como funciones puras en `src/services/emailTemplates.ts`
  (asunto + texto + HTML reales, con los datos de cobertura/días
  restantes), pero **no hay envío real conectado** — sin
  `RESEND_API_KEY`, el contenido queda en el log del servidor en vez de
  salir por correo. El email de bienvenida (día 1) ya está enganchado a
  `POST /onboarding/accept-invitation` como demostración del punto de
  integración.

### Compliance, trazabilidad y retención (GDPR / ISO 27001)
- **Audit logs inmutables**: `audit_logs` registra automáticamente carga de
  evidencias, cambios de estado de hallazgos, generación/descarga de
  reportes, cambios de rol y de organización, y purgas por retención — con
  actor, IP, user-agent y payload antes/después. RLS habilita solo
  `INSERT`/`SELECT`; sin policy de `UPDATE`/`DELETE`, esas operaciones quedan
  bloqueadas para cualquier rol sujeto a RLS (verificado: un intento de
  `UPDATE`/`DELETE` desde un cliente autenticado normal afecta 0 filas, sin
  error). `organization_id` usa `on delete set null` (no cascade) para que el
  historial sobreviva al borrado de la organización que lo generó. Vistas:
  `/audits/:id/history` (una auditoría) y `/admin/audit-logs` (toda la
  plataforma, solo platform admin).
- **Retención y purga de evidencias**: cada organización configura
  `retention_period_days` en `/settings/retention` (solo `ciso` o platform
  admin). Un worker de BullMQ (`worker:retention`) corre una pasada diaria
  vía Job Scheduler que borra el binario en Storage de las evidencias
  vencidas y marca la fila como `is_purged = true` — la fila y su metadata
  (quién subió, cuándo) se conservan para fines legales, solo se elimina el
  archivo. `POST /admin/retention/run-now` dispara una pasada inmediata sin
  esperar al schedule diario.
- **Falsos positivos / riesgo aceptado**: `PATCH /findings/:id/status` exige
  `justification_notes` (mín. 10 caracteres); `reviewed_by` se toma del
  usuario autenticado, nunca del body. Los hallazgos en `false_positive` o
  `accepted_risk` se excluyen del cálculo de puntaje de riesgo
  (`GET /audits/:id/report`) pero siguen apareciendo en el reporte con su
  justificación, para dejar constancia de la decisión.

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
| GET | `/admin/costs/summary` | *(platform admin)* Costo total estimado del mes, desglosado por servicio |
| GET | `/admin/costs/breakdown` | *(platform admin)* Serie diaria de costo por servicio + costo por organización (`?from=&to=` ISO) |
| GET | `/admin/costs/audits` | *(platform admin)* Auditorías ordenadas por costo total (`?limit=&from=&to=`) |
| GET / PATCH | `/admin/costs/pricing` | *(platform admin)* Lee / actualiza las tarifas unitarias por proveedor |
| GET | `/audits/:id/history` | Timeline de audit logs de una auditoría (evidencias, hallazgos, reportes) |
| GET | `/admin/audit-logs` | *(platform admin)* Audit logs de toda la plataforma (`?organizationId=&action=&limit=`) |
| PATCH | `/findings/:id/status` | Cambia estado de un hallazgo a `open`/`false_positive`/`accepted_risk` con justificación obligatoria |
| GET / PATCH | `/settings/retention` | Lee / actualiza `retention_period_days` de la propia organización *(PATCH solo `ciso`)* |
| POST | `/admin/retention/run-now` | *(platform admin)* Dispara una pasada de purga inmediata |
| POST | `/invitations` | *(platform admin)* Genera un link de invitación de un solo uso (`{ email?, temporaryAccess }`, email opcional) |
| GET | `/invitations/:token` | *(público, sin auth)* Preview de un link de invitación — organización y rol, para mostrar antes de registrarse |
| POST | `/onboarding/accept-invitation` | Crea el `profiles` de quien acepta un link (`{ token, fullName }`) — organización/rol vienen del token, no del body |

---

## Frontend — pantallas

| Ruta | Qué hace |
|---|---|
| `/login`, `/register` | Auth (email/password + Google) |
| `/onboarding` | Paso final de registro (crear organización), o aceptar una invitación existente si el usuario fue invitado |
| `/dashboard` | Métricas, distribución de riesgos, alta rápida de auditorías |
| `/assets` | Gestión de activos: tabla con filtros, alta/edición, verificación, borrado |
| `/audits/new` | Creación de auditoría con selección múltiple de activos |
| `/audits/[id]` | Matriz de cobertura + carga de evidencias (drag & drop) + disparo manual de escaneo |
| `/audits/[id]/report` | Hallazgos filtrables por severidad, acciones de falso positivo/riesgo aceptado, descarga de PDF |
| `/settings/team` | *(platform admin)* Genera links de invitación (copiar/compartir), permanentes o Piloto Invitado (10 días) |
| `/admin` | *(solo platform admin)* Métricas de plataforma, gestión de organizaciones, roles y actividad |
| `/admin/costs` | *(solo platform admin)* Panel FinOps: costo estimado por servicio del stack, tendencia diaria, top auditorías más costosas y edición de tarifas |
| `/audits/[id]/history` | Línea de tiempo de audit logs de esa auditoría (evidencias, hallazgos, reportes) |
| `/admin/audit-logs` | *(solo platform admin)* Audit logs de toda la plataforma, filtrables por organización/acción |
| `/settings/retention` | *(`ciso` o platform admin)* Configura días de retención de evidencias y ve estadísticas de purga |

Selector de idioma (ES neutro / EN) en todas las pantallas, persistido en
`localStorage`.

---

## Limitaciones conocidas / próximos pasos

- El worker de escaneo requiere `nmap` instalado donde corra; si no está, la
  auditoría queda en `failed` (no se inventan resultados). Los chequeos de
  TLS/cabeceras HTTP no dependen de nmap.
- El "log de actividad" que se ve al abrir el detalle de una organización en
  `/admin` sigue siendo una vista liviana basada en `created_at` (últimas
  auditorías/activos/evidencias) — es distinto del audit log real e
  inmutable (`audit_logs`, ver `/admin/audit-logs` y `/audits/[id]/history`),
  que sí instrumenta cada escritura relevante con actor/IP/payload.
- La estimación de almacenamiento en `/admin` suma `audit_evidences.size_bytes`
  (ya se guarda por evidencia); no consulta la Management API de Supabase.
- La suite de tests (`npm test`) necesita un proyecto Supabase **de test**
  separado — no se puede correr sin esa infraestructura.
- No hay flujo de "cambiar contraseña" todavía. Invitar sí está resuelto
  (`/settings/team`), permanente o como Piloto Invitado de 10 días — pero
  solo un platform admin puede invitar, no cualquier `ciso`.
- El panel FinOps (`/admin/costs`) calcula costos **estimados**, no reales:
  no hay integración con las APIs de facturación de Supabase/Upstash/el
  hosting (requerirían tokens de Management API distintos al service_role).
  Storage, escaneos (`scan_runs`, agregada para esto), reportes y miembros
  se miden con datos reales del sistema; el costo de hosting no tiene una
  métrica real disponible y se modela como un costo fijo mensual prorrateado
  por actividad. Las tarifas unitarias (denominadas en USD, como facturan
  los proveedores) son editables desde la propia UI, igual que el tipo de
  cambio USD→CLP usado para mostrar todo el panel en pesos chilenos
  (fila `fx_usd_clp`, valor semilla 950 — hay que ajustarla al tipo de
  cambio real).
- El worker de retención (`worker:retention`) corre como proceso aparte del
  API (igual que `worker:scan`); en producción hace falta levantarlo por
  separado (o migrar a un cron real del hosting) para que la purga diaria
  realmente se ejecute.
- La UI de gestión de riesgo (`/audits/[id]/report`) solo expone las
  transiciones `false_positive`/`accepted_risk`/volver a `open`; el estado
  `remediated` existe en el esquema pero no tiene flujo propio todavía.
- El botón "Ejecutar escaneo" de `/audits/[id]` reutiliza `POST
  /audits/:id/run-scan` sin pasar `asset_ids`: escanea todos los activos
  verificados de la organización, no solo los vinculados a esa auditoría
  puntual (comportamiento heredado del endpoint, no nuevo de este botón).
- La cuota de 3 escaneos del Piloto Invitado cuenta `scan_runs` (escaneos
  ya *completados*), no requests en curso: varias llamadas a
  `POST /run-scan` disparadas antes de que la primera termine podrían
  encolarse por encima de 3 en una ventana muy angosta. No aplica a la
  cuota de storage, que sí se valida contra el tamaño acumulado real antes
  de aceptar cada subida.
