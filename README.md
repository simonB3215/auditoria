# Aegis CyberAudit

Plataforma de auditoría de ciberseguridad para pymes: gestión de activos,
checklist de cumplimiento normativo (ISO 27001 / NIST CSF / GDPR / Ley N°
21.663 de Chile — ANCI / normativa local), ingesta y validación de
evidencias, motor de escaneo asíncrono, y generación de reportes ejecutivos
con scoring de riesgo.

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
| `npm run worker:economic-indicators` | Worker que refresca UF/UTM/Dólar desde Mindicador.cl (corre diario a las 08:00 America/Santiago vía BullMQ Job Scheduler; el endpoint del panel también refresca al vuelo si el caché tiene más de 1h) |
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
- **Gestión directa de usuarios (`/admin`, modal de organización)**: cada
  quien se registra crea su propia organización (`POST /onboarding/organization`,
  ver `/register`) — no existe ningún flujo de invitación. Para llevar a un
  usuario que ya tiene cuenta a la organización correcta (ej. sacarlo de la
  organización personal que se le creó al registrarse y moverlo a la
  corporativa), un platform admin lo reasigna directamente desde `/admin`
  con un selector inline ("Mover a...") — efecto inmediato, sin invitación
  ni correo (`POST /admin/users/assign-organization`). El cambio de rol y
  de `is_platform_admin` usa el mismo patrón (`POST /admin/users/role`).
- **Borrar una organización no queda bloqueado por su historial**: borrar
  un perfil (directo o en cascada al borrar su organización) no debe
  romper la integridad referencial de lo que ese usuario generó —
  evidencias, activos, auditorías, reportes y revisiones de hallazgos
  necesitan sobrevivir para la trazabilidad de la Ley 21.663, aunque quien
  los creó ya no exista. Las columnas `audit_evidences.uploaded_by`,
  `assets.created_by`, `audits.created_by`, `reports.generated_by` y
  `findings.reviewed_by` son nullable con `on delete set null` (migración
  `018_fix_profile_deletion_fks.sql`) — antes de esta migración, ninguna
  tenía una regla `ON DELETE` explícita (Postgres usa `NO ACTION` por
  defecto), así que borrar una organización con evidencia cargada fallaba
  de forma intermitente con `foreign key constraint
  "audit_evidences_uploaded_by_fkey"` (Postgres no garantiza el orden entre
  ramas hermanas de una cascada). `DELETE /admin/organizations/:id`
  también traduce cualquier violación de FK (`23503`) restante a un 409
  con mensaje claro en vez de filtrar el error crudo de Postgres. La lista
  de evidencias (`/audits/:id`) muestra "Usuario eliminado / Sistema" en
  vez de romperse cuando el que subió el archivo ya no tiene perfil.

### Persistencia de sesión y contraseñas
Diagnóstico y correcciones sobre expiración de sesión e indicadores de
usuarios (a.md, "PROMPT DE DIAGNÓSTICO Y CORRECCIÓN: PERSISTENCIA DE
SESIÓN..."):
- **Middleware de Next.js (`frontend/src/middleware.ts` /
  `lib/supabase/middleware.ts`)**: se revisó contra el patrón canónico de
  `@supabase/ssr` y ya estaba correcto — llama `supabase.auth.getUser()`
  (que refresca la sesión si hace falta) y reemite las cookies actualizadas
  en cada response. No se encontró ahí la causa de cierres de sesión
  prematuros; el TTL de tokens en sí es una config del proyecto Supabase
  (Auth > Settings), no algo controlable desde el código de la app.
- **Interceptor de refresh-and-retry (`frontend/src/lib/api.ts`)**: el gap
  real está en el cliente del browser — `getSession()` refresca cuando
  detecta el token vencido, pero queda una ventana (reloj desincronizado,
  pestaña en segundo plano que no corrió el timer de auto-refresh) donde
  igual llega un access token vencido al backend, que responde 401 y cada
  página lo mostraba como error aunque el refresh token siguiera siendo
  válido — el síntoma de "expiración prematura" que reporta a.md. Se agregó
  un interceptor de respuesta que, ante un 401, intenta
  `supabase.auth.refreshSession()` una vez y reintenta la request original;
  si el refresh también falla, el error se propaga igual que antes (no hay
  loop ni redirect forzado nuevo).
- **Cambio de contraseña propio (`/settings/account`, página nueva)**:
  formulario mínimo que llama `supabase.auth.updateUser({ password })`
  directo desde el browser (no pasa por el backend, igual que el login) y
  fuerza `refreshSession()` después para que el nuevo token quede propagado
  sin cerrar la sesión de la pestaña actual (a.md: "sin cerrar la ventana
  actual") — verificado con Playwright que tras cambiar la contraseña la
  navegación a `/dashboard` no redirige a `/login`.
- **Restablecimiento administrativo (`/admin/users`, botón "Restablecer
  contraseña")**: `POST /api/v1/admin/users/reset-password` usa
  `auth.admin.updateUserById` para fijar la contraseña y además invalida
  las sesiones del usuario en otros dispositivos. supabase-js (auth-js
  2.112) solo expone `auth.admin.signOut(jwt, scope)`, que pide el JWT de
  la sesión a cerrar — inútil cuando un admin actúa sobre la cuenta de otra
  persona, de la que no tiene ningún token. La forma soportada por Supabase
  para este caso es borrar las filas de `auth.sessions` del usuario
  directamente; se expuso como función `SECURITY DEFINER`
  (`db/migrations/020_force_sign_out_function.sql`, `force_sign_out_user`)
  llamada vía `supabaseAdmin.rpc(...)` en vez de abrir una conexión `pg`
  nueva en el backend (que hoy solo usa supabase-js). **Matiz importante**:
  esto invalida el *refresh token* (fuerza re-login en cuanto el access
  token en curso expire, normalmente ≤1h) — no revoca instantáneamente un
  access token JWT ya emitido y todavía no vencido, porque esos JWT son
  auto-contenidos y no se validan contra una tabla de sesiones. Es una
  propiedad de JWT sin estado, no una limitación de esta implementación.
  Verificado con un script contra Supabase real: el refresh token previo al
  reset queda rechazado (`Invalid Refresh Token: Refresh Token Not Found`)
  y la contraseña vieja deja de servir para loguearse.
- **Logging de errores de autenticación (a.md, sección 4)**:
  `authenticateToken` clasifica el mensaje de `auth.getUser()`
  (`jwt_expired` / `refresh_token_not_found` / `invalid_credentials` /
  `unknown`), lo loguea en consola y lo registra en `audit_logs`
  (`AUTH_TOKEN_REJECTED`). El login en sí pega directo a Supabase Auth
  desde el browser — nunca pasa por este backend — así que no hay señal
  server-side nativa de intentos fallidos de login sin configurar un Auth
  Hook de Supabase (infraestructura fuera de alcance). Como adaptación
  honesta, `/login` reporta el fallo con un best-effort
  `POST /api/v1/auth/log-failure` (público, sin token porque en ese momento
  no existe sesión, protegido por el rate limiter estricto existente) que
  también escribe en `audit_logs` (`AUTH_LOGIN_FAILED`).

### Panel de administración (`/admin`) — Command Center
Rediseño completo del panel de plataforma (a.md, "Rediseño y reestructuración
completa del Dashboard de Administración") con navegación por sidebar
colapsable y las organizaciones desacopladas de la gestión de usuarios.
- **Layout** (`frontend/src/app/(app)/admin/layout.tsx`): sidebar fijo
  agrupado en 4 categorías (General, Gestión, Operaciones & Seguridad,
  Finanzas & FinOps), colapsable y persistido en `localStorage`. El guard
  de `is_platform_admin` vive acá una sola vez para todo el módulo en vez
  de repetirse en cada página.
- **Buscador universal (`Cmd/Ctrl+K`)**: filtra en el cliente contra un
  índice liviano de organizaciones + usuarios ya cargado (`GET
  /admin/organizations` + `GET /admin/users`, sin paginar — a esta escala
  alcanza). Es una adaptación honesta del "Cmd+K" que pedía el prompt
  original: no hay un índice de búsqueda ni un command palette de verdad,
  es un filtro por substring sobre los datos que el panel ya tiene
  cargados, con resultados que llevan a la página correspondiente.
- **Badges de estado del sistema**: "Workers" hace un `PING` real a Redis
  (la misma conexión que usan los workers de BullMQ) y "APIs" reutiliza el
  flag `stale` de los indicadores económicos (`GET
  /admin/system-status`) — señales reales, no simuladas, reutilizando
  infraestructura que ya existía en vez de montar un sistema de monitoreo
  nuevo.
- **Modo oscuro/claro**: toggle real (`ThemeProvider`,
  `frontend/src/lib/theme/context.tsx`) que agrega/quita la clase `dark`
  en `<html>` y persiste en `localStorage` — mismo patrón que
  `I18nProvider`. Un script inline bloqueante en `app/layout.tsx` aplica
  el tema guardado antes de la primera pintura para evitar flash de
  contenido sin estilo.
- **Toasts**: sistema propio (`frontend/src/hooks/use-toast.tsx`, sin
  dependencias externas) para confirmar acciones exitosas — los errores
  siguen mostrándose con el `Alert` en la propia página, consistente con
  el resto de la plataforma.
- **`/admin` (Resumen)**: 4 tarjetas con datos 100% reales (organizaciones
  registradas, dominios verificados, MRR real, auditorías del mes —
  reutiliza directamente `GET /admin/kpis/real-metrics`), un gráfico de
  actividad reciente, y una tarjeta de alertas operativas construida con
  señales reales (organizaciones suspendidas, dominios pendientes de
  verificación, intentos de escaneo no autorizado bloqueados
  recientemente) — no hay indicadores de tendencia (+/-) inventados: no
  existe ningún snapshot histórico guardado para calcular una variación
  real, así que se muestran los valores absolutos del periodo actual.
- **`/admin/organizations`**: las organizaciones pasan a ser una entidad
  de empresa pura — nombre, dominio principal, plan, estado de
  verificación DNS, sin ninguna columna ni conteo de usuarios en la fila
  (`organizations.plan`, migración `019_organization_entity_fields.sql`).
  La misma migración agregó también `organizations.rut`, pero ningún
  formulario de la plataforma lo capturaba (el onboarding solo pide
  nombre) — quedaba `null` siempre y solo generaba una columna/fallback
  "Sin RUT" sin valor real; se eliminó por completo (columna, endpoints y
  UI) en la migración `021_drop_organization_rut.sql` (a.md, "AUDITORÍA Y
  LIMPIEZA DE INCONSISTENCIAS EN MODELO DE DATOS, UI Y FORMULARIOS").
  `plan` es una **etiqueta**
  administrativa editable (`starter`/`pro`/`custom`), no una suscripción
  real — no hay pasarela de pagos conectada, mismo criterio que
  `is_suspended`. Acciones por fila: editar (`PATCH
  /admin/organizations/:id`), archivar/reactivar (reusa `.../suspend`),
  ver detalle (dominios + actividad reciente vía `GET
  /admin/organizations/:id/domains` y `.../activity`), eliminar.
- **`/admin/users`**: gestión global de usuarios, desacoplada de la tabla
  de organizaciones (`GET /admin/users`, cruza `profiles` con `auth.users`
  vía la Admin API de Supabase para traer el email real). Acciones por
  fila: cambiar rol, otorgar/quitar `platform_admin`, reasignar
  organización (mismo mecanismo que ya existía,
  `POST /admin/users/assign-organization`), y **desactivar/reactivar
  cuenta** — nuevo (`POST /admin/users/deactivate`): usa el "ban" nativo
  de Supabase Auth (bloquea el login de inmediato, verificado end-to-end)
  en vez de un flag propio que habría que duplicar en `authenticateToken`.
  **Restablecer contraseña** (nuevo, ver "Persistencia de sesión y
  contraseñas" arriba) también vive acá, un botón por fila. Encima de la
  tabla, 4 tarjetas de indicadores (a.md, sección 1) calculadas por
  `GET /admin/users` sobre los mismos datos que ya trae (sin una consulta
  extra por tarjeta): activos/inactivos (sesión en los últimos 30 días),
  % de cuentas con 2FA activo + alerta si hay cuentas con ≥3 intentos
  fallidos de login en 24h (ver adaptación de logging más arriba — hoy da
  0% de 2FA porque la app todavía no ofrece UI para enrolar factores, es un
  número real, no inventado), conteo estricto de `is_platform_admin = true`,
  y cuentas "posiblemente abandonadas" (creadas hace más de 14 días sin
  login en los últimos 90). La tabla también suma una columna "Último
  acceso" con tiempo relativo (`Intl.RelativeTimeFormat`) para poder ir
  directo a esas cuentas.
- **FinOps unificado bajo tabs**: `/admin/costs` y `/admin/internal-finops`
  siguen siendo dos páginas independientes (cada una con su propio estado
  y fetching, uno mide gasto real y el otro simula ingresos) pero ahora
  comparten un selector visual tipo Tabs (`FinOpsTabs`) que navega entre
  ambas sin volver al panel principal — una fusión real en una sola página
  con un único árbol de estado habría sido mucho más invasiva sin agregar
  valor real.
- **Desviación de a.md**: el prompt original pedía un ítem de nav
  "Auditorías y Escaneos" separado de "Audit Logs & Trazabilidad" dentro
  de Operaciones & Seguridad — no existe ninguna vista administrativa
  global de auditorías/escaneos (las auditorías se gestionan por
  organización, no desde un panel admin), así que ese ítem quedó afuera en
  vez de crear una página nueva sin datos reales que mostrar.

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

### Registro de activos accesible y guiado (`/assets`)
El modal "Registrar recurso para auditoría" (antes "Agregar activo") está
pensado para que lo complete cualquier perfil, no solo gente técnica —
a.md, "Rediseño accesible y guiado del modal Agregar activo".
- **Microcopy explicativo**: cada tipo de activo tiene una descripción en
  lenguaje simple debajo del selector (ej. "Repositorio Git: el código
  fuente de una aplicación"), y el placeholder del campo Valor cambia
  según el tipo elegido (`192.168.1.10` para IP,
  `https://github.com/tu-empresa/tu-proyecto` para repositorio, etc.).
- **Criticidad como tarjetas, no un selector plano**: los 4 niveles
  (crítica/alta/media/baja) se muestran como tarjetas clickeables con un
  punto de color y una frase de impacto de negocio cada una (ej. "Si
  falla, se detiene la operación del negocio"), armadas sobre un
  `RadioGroup` de Radix — navegable con flechas de teclado igual que un
  grupo de radios nativo.
- **Etiquetas como chips**: en vez de un campo de texto libre, hay chips
  predefinidos (Producción, Sitio Web, Interno, Backend, etc.) que se
  activan con un clic, más un campo aparte para etiquetas propias.
- **Validación en tiempo real sin dependencias nuevas**: el prompt
  original pedía Zod/React Hook Form — es un solo formulario chico, así
  que se adaptó con funciones de validación puras por tipo (regex de
  IP/CIDR/dominio/URL de repositorio) en vez de sumar una dependencia
  nueva al frontend (Zod hoy solo lo usa el backend). El error aparece
  recién al salir del campo (`onBlur`), nunca mientras el usuario todavía
  está escribiendo, y usa `aria-invalid` + `aria-describedby` + `role="alert"`
  para que un lector de pantalla lo anuncie de inmediato.
- **Accesibilidad (WCAG 2.1 AA)**: el focus trap y el cierre con `Esc` ya
  los da gratis `Dialog` de Radix (no hizo falta código nuevo para eso).
  Se sumaron dos primitivos nuevos siguiendo el mismo patrón que
  `dropdown-menu.tsx`/`select.tsx`: `components/ui/tooltip.tsx` (los
  íconos "?" junto a cada campo) y `components/ui/radio-group.tsx` (las
  tarjetas de criticidad). El texto de ayuda de cada tooltip también
  quedó visible de forma permanente debajo del campo — el tooltip es un
  refuerzo, nunca la única vía para acceder a la explicación (hover-only
  es un anti-patrón de accesibilidad).
- **Botones**: "Guardar" en color primario con spinner de carga
  (`Loader2` animado, mismo patrón que el resto de la app) y un botón
  "Cancelar" explícito al lado, además del cierre con la "X" o `Esc`.

### Seguridad
- Evidencias cifradas (AES-256-GCM) antes de subir a Storage.
- Buckets privados; los reportes se sirven vía signed URL temporal.
- Rate limiting específico en acciones sensibles (subir evidencia, lanzar
  escaneo) además del rate limit general.
- Ningún endpoint permite auto-otorgarse organización, rol o `platform_admin`.

### Piloto Invitado (10 días)
> ⚠️ **El mecanismo para crear un Piloto Invitado nuevo quedó huérfano.**
> Este rol (`auditor_guest`) se otorgaba exclusivamente al aceptar un link
> de invitación, y ese sistema (`invite_links`, `/settings/team`,
> `/register?invite=<token>`, `POST /onboarding/accept-invitation`) se
> eliminó por completo — toda gestión de usuarios ahora es asignación
> directa desde `/admin` (ver sección de arriba), y esa asignación directa
> (`POST /admin/users/role`) solo acepta `ciso`/`auditor`/`viewer`, no
> `auditor_guest`. La mecánica de expiración/degradación/cuotas descrita
> abajo sigue vigente para cualquier perfil que ya tenga el rol, pero hoy
> no hay ninguna forma de generar uno nuevo desde la UI. Pendiente:
> decidir si se agrega `auditor_guest` como opción asignable en
> `/admin/users/role`, o si se da de baja el resto de la funcionalidad.
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
  salir por correo. El email de bienvenida (día 1) ya no está enganchado a
  ningún punto de integración real (vivía en `POST /onboarding/accept-invitation`,
  eliminado junto con el resto del sistema de invitación) — las funciones
  siguen ahí, listas para conectarse el día que exista otra forma de dar de
  alta un Piloto Invitado.

### Ley N° 21.663 de Ciberseguridad (Chile — ANCI)
- Framework seleccionable `ley_21663_cl` en `/audits/new` y en la edición de
  auditorías. Sus requisitos (`src/data/complianceRequirements.ts`) se
  dividen en dos ejes independientes:
  - **`kind`**: `documentary` (requiere evidencia subida, como el resto de
    los frameworks) o `technical` (se satisface automáticamente contra los
    hallazgos del motor de escaneo — Nmap/TLS/cabeceras — sin esperar un
    archivo; nunca aparece en la matriz de cobertura documental ni en el
    selector de evidencia, para no pedir un archivo que nunca hace falta).
  - **`tier`**: `SE` (Servicios Esenciales, el piso común) u `OIV`
    (Operadores de Importancia Vital, que ACUMULA todo lo de SE más sus
    requisitos exclusivos — nunca es un conjunto separado).
- `GET /audits/:id/anci-status` (`src/services/anciCoverageEngine.ts`)
  combina evidencia documental y hallazgos de escaneo en dos porcentajes —
  cumplimiento SE y cumplimiento OIV — más el detalle de cada control
  técnico (`ok` / `fail` / `not_scanned`). Se muestra como tarjeta propia
  en `/audits/[id]/report` cuando el framework tiene controles con `tier`.
- **Trazabilidad**: cada activo efectivamente escaneado genera un evento
  `SCAN_EXECUTED` en `audit_logs` con el target, quién disparó el escaneo y
  un hash SHA-256 de integridad de ese resultado puntual (`scanWorker.ts`).
- El reporte PDF de una auditoría `ley_21663_cl` agrega una sección
  "Informe de Posición de Riesgo — Ley 21.663 (ANCI)" con el % SE/OIV, el
  detalle de controles técnicos, una bitácora de evidencias, y un hash
  SHA-256 de verificación del documento — **no es una firma electrónica
  avanzada ni calificada** en los términos de la Ley N° 19.799, se etiqueta
  explícitamente como tal en el propio PDF para no sobre-prometer validez
  legal que requeriría PKI/certificado calificado (fuera de alcance).
- El botón "Ejecutar escaneo" de `/audits/[id]` refresca el estado del
  audit cada 3s mientras está `queued`/`running`, sin necesidad de recargar
  la página a mano, hasta reflejar `completed`/`failed`.

### Verificación de propiedad de dominio
Ningún dominio se escanea sin antes probar que la organización es su dueña —
requisito de la Ley N° 21.663 y salvaguarda contra escanear infraestructura
de terceros sin autorización.
- **Modelo de datos**: se extendió `assets` (migración
  `002_asset_verification.sql` + `015_domain_global_uniqueness.sql`) en vez
  de crear la tabla `organization_domains` que sugería el prompt original —
  el estado de verificación ya vivía en `assets.verification_status` y
  duplicarlo en una tabla paralela habría creado dos fuentes de verdad. La
  migración 015 agrega un índice único global (parcial, case-insensitive)
  sobre `assets.value` para `type = 'domain'`: un mismo dominio no puede
  quedar "verificado" por dos organizaciones a la vez, aunque cada una lo
  haya cargado de forma independiente.
- **Desafío DNS**: `POST /assets/:id/verify` busca un registro TXT en la
  **raíz** del dominio (`@`, sin subdominio dedicado) con el valor
  `aegis-site-verification=<verification_token>` — un solo registro que
  cualquier persona no técnica puede seguir desde el panel de su proveedor
  DNS (Cloudflare, NIC Chile, GoDaddy, AWS, etc.).
- **Security gate en el escáner**: `POST /audits/:id/run-scan` no descarta
  en silencio los activos no verificados que se pidan por `asset_ids` —
  aborta toda la solicitud con `403 UNAUTHORIZED_SCAN_TARGET` y registra el
  intento en `audit_logs` (`UNAUTHORIZED_SCAN_BLOCKED`), con el detalle de
  qué activos estaban sin verificar.
- **Delegación a TI**: quien pide la auditoría no siempre tiene acceso al
  panel DNS de su propio dominio. `POST /assets/:id/delegate-verification`
  arma y envía (mismo patrón "preparado pero no conectado" que el resto de
  los emails — ver más abajo) un correo con el registro TXT exacto a crear,
  reutilizable desde el modal guiado de `/assets`.
- **UI guiada (a.md, "Modal de verificación de dominio por DNS")**: en
  `/assets`, verificar un activo de tipo dominio abre un modal con
  explicación en lenguaje llano y el registro TXT separado en dos campos
  independientes con su propio botón de copiado — Host (`TXT` / `@`, fijo
  porque hoy no hay un campo de subdominio distinto en el modelo de
  `Asset`) y Valor (`aegis-site-verification=<token>`, con truncado para no
  romper el layout) — en vez de una sola caja con todo el string, más
  fácil de confundir al pegar en Cloudflare/NIC Chile/GoDaddy/AWS. Los 4
  pasos incluyen una nota de propagación DNS (1-5 min), el botón
  "Verificar ahora" muestra un spinner mientras el backend resuelve el TXT,
  y la opción "Enviar instrucciones a mi equipo de TI" sigue siendo el
  mismo diálogo, sin abrir un segundo modal superpuesto. Los activos
  IP/CIDR siguen su verificación directa anterior (autoatestación de un
  `ciso`, sin desafío DNS — no hay un mecanismo equivalente simple para el
  MVP).

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

### FinOps interno — proyección financiera (`/admin/internal-finops`)
Panel privado para la mesa ejecutiva, separado del panel de costos de
infraestructura (`/admin/costs`): mientras `/admin/costs` mide **gasto real**
de la plataforma, `/admin/internal-finops` simula **ingresos, costos
variables y margen** de negocio a partir de indicadores económicos oficiales
en tiempo real.
- **Indicadores en vivo con resiliencia**: `src/services/economicIndicators.ts`
  consulta `https://mindicador.cl/api` (UF, UTM, Dólar observado) y cachea
  cada valor obtenido en `system_economic_indicators`. Estrategia de caché:
  valores de menos de 1h se sirven directo (no golpea la API pública en cada
  carga del panel); más viejos disparan un fetch en vivo; si Mindicador.cl no
  responde, se cae automáticamente al último valor guardado (marcado `stale`
  en la respuesta, con badge distinto en la UI). Un worker de BullMQ
  (`worker:economic-indicators`) corre además una pasada diaria a las 08:00
  (America/Santiago) como garantía adicional de frescura — adaptación del
  "Vercel Cron o pg_cron" que pedía el prompt original a la misma
  infraestructura de Job Scheduler que ya usa `worker:retention`, ya que este
  proyecto no corre en Vercel ni usa la extensión `pg_cron`.
- **Motor de simulación** (`src/services/finopsProjection.ts`, funciones
  puras): MRR = (clientes Starter × 1,5 UF + clientes Pro × 4,5 UF) × valor
  UF; COGS = clientes totales × (USD 0,25 × valor dólar); OPEX = USD 40 ×
  valor dólar (todos editables desde los sliders del panel, salvo el precio
  por plan). El punto de equilibrio usa el margen de contribución promedio de
  la mezcla Starter/Pro simulada; si esa mezcla nunca cubre el OPEX, se
  muestra explícitamente como "no alcanzable" en vez de un número negativo
  sin sentido. La proyección a 12 meses es un **run-rate constante** (sin
  curva de crecimiento ni churn, que el prompt original no especificaba) —
  muestra hacia dónde converge el escenario actual, no un pronóstico.
- **Acceso**: el prompt original pedía roles `super_admin`/`executive`
  dedicados; se reutiliza `profiles.is_platform_admin` (`requirePlatformAdmin`)
  en vez de introducir un segundo sistema de roles paralelo solo para este
  panel — es el mismo flag de máximo privilegio que ya protege el resto de
  `/admin/*`.
- **UI**: ticker con UF/UTM/Dólar del día + badge de conexión, sliders para
  clientes Starter/Pro, % de penetración del universo de ~10.000 empresas
  afectas a la Ley 21.663 (SII) y OPEX en USD, tarjetas de MRR/ARR/COGS/OPEX/
  margen neto/punto de equilibrio, y un gráfico de líneas (Recharts) con
  Ingresos vs. Costos vs. Utilidad Neta acumulados a 12 meses. Los sliders
  recalculan contra el backend con un debounce de 300ms.

### KPIs reales del negocio (`/admin/kpis`)
Contraparte del panel de simulación (`/admin/internal-finops`): en vez de
proyectar escenarios hipotéticos, consulta las tablas reales de la
plataforma para reportar rendimiento **ya ejecutado** — sin simulación ni
datos inventados. Selector de periodo (mes actual / último trimestre
rolling / año a la fecha) que recalcula todo contra `src/services/realKpiService.ts`.
- **Sin fabricar lo que no existe**: el prompt original asume tablas de
  `suscripciones`/`facturación` que no existen en este proyecto — no hay
  pasarela de pagos conectada (ver "Limitaciones conocidas"). En vez de
  inventar planes o clientes pagos ficticios, los indicadores financieros
  que dependen de facturación real (MRR, ARR, ARPU, margen bruto) se
  calculan honestamente en `0`/`null` con un flag explícito
  `billingConnected: false` en la respuesta — mismo patrón "preparado pero
  no conectado" que ya se usa para el envío de emails. **COGS real sí es un
  dato genuino**: reutiliza `getCostBreakdown()` de `costEngine.ts` (el
  mismo motor de `/admin/costs`), acotado al periodo seleccionado.
- **Embudo comercial real**: organizaciones totales, dominios verificados,
  organizaciones con Piloto Invitado activo o usado (señal real vía
  `profiles.expires_at`, que se conserva incluso después de que el
  Piloto expira y el perfil baja a `viewer`), y clientes pagados (`0` hoy,
  mismo motivo que el punto anterior). Penetración de mercado reutiliza la
  misma constante de 10.000 empresas (Ley 21.663 / SII) que
  `/admin/internal-finops`.
- **Indicadores operativos reales**: % de dominios verificados (sobre
  `assets` tipo `domain`, ver módulo de verificación de dominio),
  auditorías completadas y hallazgos críticos detectados en el periodo, y
  cantidad de correos de delegación a TI enviados
  (`audit_logs.action = 'DOMAIN_VERIFICATION_EMAIL_SENT'`) — reutiliza
  directamente instrumentación que ya existía de fases anteriores.
- **Tabla de organizaciones**: el prompt original pedía una tabla de
  suscripciones por plan (Starter/Pro/Custom) con estado de pago — al no
  existir ningún concepto de plan o pago, se reemplaza por una
  segmentación basada en la única señal de ciclo de vida que sí es real:
  *Piloto Invitado activo*, *Piloto Invitado vencido* o *Cuenta estándar*.
- Ver `DASHBOARD_FINOPS_INTERNO.md` (documentación del panel de
  simulación) para la comparación completa entre ambos paneles.

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
| POST | `/assets/:id/verify` | Verificar propiedad de un activo (dominio: desafío DNS TXT; IP/CIDR: autoatestación `ciso`) |
| POST | `/assets/:id/delegate-verification` | Envía por correo las instrucciones de verificación DNS a un contacto de TI (`{ email }`) |
| POST | `/audits/:id/run-scan` | Encolar un escaneo asíncrono — `403 UNAUTHORIZED_SCAN_TARGET` si algún activo pedido no está verificado |
| GET | `/audits/:id/findings` | Hallazgos (filtrable por `?severity=`) |
| GET | `/audits/:id/report` | Genera el reporte y devuelve `{ signedUrl, riskScore, coverage }` |
| GET | `/audits/:id/anci-status` | Cumplimiento Ley 21.663: `{ sePercentage, oivPercentage, technicalControls }` |
| GET | `/dashboard/summary` | Métricas agregadas para el dashboard |
| GET | `/admin/organizations` | *(platform admin)* Todas las organizaciones (entidad pura: plan, dominio principal, verificación DNS, storage) |
| PATCH | `/admin/organizations/:id` | *(platform admin)* Edita nombre/plan de una organización |
| PATCH | `/admin/organizations/:id/suspend` | *(platform admin)* Suspende/reactiva (archiva) una organización |
| DELETE | `/admin/organizations/:id` | *(platform admin)* Borra una organización |
| GET | `/admin/organizations/:id/domains` | *(platform admin)* Dominios de una organización con su estado de verificación |
| GET | `/admin/organizations/:id/activity` | *(platform admin)* Actividad reciente |
| GET | `/admin/users` | *(platform admin)* Listado global de usuarios (email real, rol, org, estado de cuenta, último acceso, 2FA — `?organizationId=` filtra) + objeto `stats` con las 4 métricas del dashboard |
| POST | `/admin/users/role` | *(platform admin)* Cambia rol y/o `platform_admin` de un usuario |
| POST | `/admin/users/assign-organization` | *(platform admin)* Reasigna directamente la organización de un usuario existente (`{ userId, organizationId }`), sin invitación ni correo |
| POST | `/admin/users/deactivate` | *(platform admin)* Desactiva/reactiva una cuenta (`{ userId, deactivated }`) — bloquea el login vía ban nativo de Supabase Auth |
| POST | `/admin/users/reset-password` | *(platform admin)* Restablece la contraseña de un usuario (`{ userId, newPassword }`) e invalida sus sesiones activas en otros dispositivos |
| GET | `/admin/system-status` | *(platform admin)* Señales reales de salud (ping a Redis, frescura de indicadores económicos) |
| POST | `/auth/log-failure` | *(público, rate-limited)* Registra un intento de login fallido en `audit_logs` — lo llama `/login` cuando `signInWithPassword` falla |
| GET | `/admin/costs/summary` | *(platform admin)* Costo total estimado del mes, desglosado por servicio |
| GET | `/admin/costs/breakdown` | *(platform admin)* Serie diaria de costo por servicio + costo por organización (`?from=&to=` ISO) |
| GET | `/admin/costs/audits` | *(platform admin)* Auditorías ordenadas por costo total (`?limit=&from=&to=`) |
| GET / PATCH | `/admin/costs/pricing` | *(platform admin)* Lee / actualiza las tarifas unitarias por proveedor |
| GET | `/admin/internal-finops/projection` | *(platform admin)* Proyección financiera interna: indicadores de Mindicador.cl + MRR/ARR/COGS/OPEX/margen/break-even (`?startersCount=&proCount=&opexUsd=&marketPenetrationPct=`) |
| GET | `/admin/kpis/real-metrics` | *(platform admin)* KPIs reales de negocio (financieros, embudo, operativos) del periodo (`?period=current_month\|last_quarter\|year_to_date`) |
| GET | `/audits/:id/history` | Timeline de audit logs de una auditoría (evidencias, hallazgos, reportes) |
| GET | `/admin/audit-logs` | *(platform admin)* Audit logs de toda la plataforma (`?organizationId=&action=&limit=`) |
| PATCH | `/findings/:id/status` | Cambia estado de un hallazgo a `open`/`false_positive`/`accepted_risk` con justificación obligatoria |
| GET / PATCH | `/settings/retention` | Lee / actualiza `retention_period_days` de la propia organización *(PATCH solo `ciso`)* |
| POST | `/admin/retention/run-now` | *(platform admin)* Dispara una pasada de purga inmediata |

---

## Frontend — pantallas

| Ruta | Qué hace |
|---|---|
| `/login`, `/register` | Auth (email/password + Google) |
| `/onboarding` | Paso final de registro: crear la organización propia |
| `/dashboard` | Métricas, distribución de riesgos, alta rápida de auditorías |
| `/assets` | Gestión de activos: tabla con filtros, alta/edición, verificación, borrado |
| `/audits/new` | Creación de auditoría con selección múltiple de activos |
| `/audits/[id]` | Matriz de cobertura + carga de evidencias (drag & drop) + disparo manual de escaneo (estado en vivo cada 3s) |
| `/audits/[id]/report` | Hallazgos filtrables por severidad, acciones de falso positivo/riesgo aceptado, tarjeta de cumplimiento ANCI (Ley 21.663), descarga de PDF |
| `/admin` | *(solo platform admin)* Resumen ejecutivo: 4 KPIs reales, actividad reciente y alertas operativas (dentro del sidebar del Command Center) |
| `/admin/organizations` | *(solo platform admin)* Organizaciones como entidad pura: plan, dominio, verificación DNS, editar/archivar/eliminar, detalle de dominios y actividad |
| `/admin/users` | *(solo platform admin)* Gestión global de usuarios: 4 tarjetas de indicadores, rol, `platform_admin`, reasignar organización, desactivar/reactivar cuenta, restablecer contraseña |
| `/admin/costs` | *(solo platform admin)* Panel FinOps: costo estimado por servicio del stack, tendencia diaria, top auditorías más costosas y edición de tarifas (bajo tabs junto a `/admin/internal-finops`) |
| `/admin/internal-finops` | *(solo platform admin)* FinOps interno: ticker UF/UTM/Dólar en vivo, sliders de simulación de escenario, MRR/ARR/COGS/OPEX/margen/break-even y proyección a 12 meses |
| `/admin/kpis` | *(solo platform admin)* KPIs reales del negocio: selector de periodo, embudo comercial, indicadores operativos, actividad diaria y tabla de organizaciones por segmento |
| `/audits/[id]/history` | Línea de tiempo de audit logs de esa auditoría (evidencias, hallazgos, reportes) |
| `/admin/audit-logs` | *(solo platform admin)* Audit logs de toda la plataforma, filtrables por organización/acción |
| `/settings/retention` | *(`ciso` o platform admin)* Configura días de retención de evidencias y ve estadísticas de purga |
| `/settings/account` | Cualquier usuario autenticado: cambia su propia contraseña sin cerrar la sesión actual |

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
- No hay ningún flujo de invitación — cada quien crea su propia organización
  al registrarse; un platform admin reorganiza gente después vía `/admin`
  (ver "Gestión directa de usuarios" arriba). El cambio de contraseña
  (propio en `/settings/account`, administrativo en `/admin/users`) sí
  existe — ver "Persistencia de sesión y contraseñas" arriba.
- `npm test` no corre hoy contra `.env.test`: la clave
  `EVIDENCE_ENCRYPTION_KEY` de ese archivo tiene 42 caracteres en vez de los
  64 hex que exige `src/config/env.ts` (falla la validación de Zod antes de
  levantar cualquier suite). Es preexistente — no lo generó ningún cambio
  de esta sesión — y no se corrigió porque implica escribir una clave de
  cifrado nueva en un archivo de config sin que se haya pedido; hay que
  regenerarla (`openssl rand -hex 32`) a mano en `.env.test` para volver a
  correr los tests de integración.
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
- El correo de delegación a TI (`POST /assets/:id/delegate-verification`)
  sigue el mismo patrón "preparado pero no conectado" que el resto de los
  emails del sistema: sin `RESEND_API_KEY`, el asunto/contenido queda en el
  log del servidor en vez de salir por correo real.
- La verificación de activos IP/CIDR es autoatestación de un `ciso` (no hay
  desafío DNS equivalente sencillo para un rango de IPs); no prueba
  criptográficamente la titularidad — a mejorar con RDAP/WHOIS cruzado
  contra el dominio corporativo ya verificado.
- La proyección a 12 meses de `/admin/internal-finops` es un run-rate
  constante del escenario simulado (sin curva de crecimiento ni churn) —
  útil para visualizar el punto de equilibrio dado el escenario actual, no
  como pronóstico real de crecimiento de clientes.
- El worker `worker:economic-indicators` es, igual que `worker:retention` y
  `worker:scan`, un proceso aparte del API; en producción hace falta
  levantarlo por separado para que la actualización diaria de UF/UTM/Dólar
  a las 08:00 realmente corra sola (el endpoint del panel igual se
  autoactualiza al vuelo si nadie lo hace, así que no es estrictamente
  necesario para que el panel funcione, solo para la garantía de frescura
  diaria).
- `/admin/kpis` reporta MRR/ARR/ARPU/margen bruto real en `0`/`null` porque
  no hay pasarela de pagos ni tabla de suscripciones conectada todavía (ver
  `financial.billingConnected: false` en la respuesta) — no es un bug, es
  el estado real hasta que exista facturación. La "tasa de conversión de
  prueba a pago" y el "churn rate" tampoco son calculables por el mismo
  motivo y se devuelven como `null`.
- "Último trimestre" en `/admin/kpis` se interpreta como los últimos 3
  meses corridos desde hoy (rolling), no el trimestre calendario anterior
  — evita ambigüedad de límites de trimestre.
- Reasignar la organización de un usuario (`POST /admin/users/assign-organization`)
  solo cambia su acceso hacia adelante — las auditorías/activos/evidencias
  que ya creó quedan tal como están, asociados a la organización original
  (vía `created_by`), no se migran ni se re-etiquetan.
- `GET /admin/users` trae hasta 1.000 usuarios en una sola página (vía
  `supabaseAdmin.auth.admin.listUsers`) — de sobra para la escala actual,
  pero habría que paginar de verdad si la plataforma creciera mucho más.
- El buscador universal de `/admin` (`Cmd/Ctrl+K`) filtra en el cliente
  contra el mismo límite de 1.000 usuarios + todas las organizaciones ya
  cargadas — no es un índice de búsqueda real ni un command palette con
  atajos de navegación, es un filtro por substring sobre datos que el
  panel ya tiene en memoria.
- El `plan` de una organización (`starter`/`pro`/`custom`) es una etiqueta
  administrativa editable desde `/admin/organizations`, no una suscripción
  real — no hay pasarela de pagos conectada, así que cambiarlo no activa
  ni desactiva ninguna funcionalidad todavía.
