# 📈 Dashboard FinOps Interno — Documentación técnica y funcional

> **Ruta:** `/admin/internal-finops` · **Acceso:** solo `platform_admin` · **Última actualización:** 4 de agosto de 2026

Panel privado de uso exclusivo para los fundadores y la mesa ejecutiva de
Aegis CyberAudit. Permite proyectar Ingresos (MRR/ARR), Costos de
Infraestructura (COGS), Gastos Fijos (OPEX) y Margen Neto del negocio,
usando indicadores económicos oficiales de Chile en tiempo real (UF, UTM,
Dólar observado).

No debe confundirse con `/admin/costs`: ese panel mide **gasto real** de
infraestructura ya incurrido (Supabase, Storage, workers, etc.) por
organización y por auditoría. Este panel, en cambio, **simula** el negocio
completo — ingresos proyectados según una cartera de clientes hipotética,
menos los costos variables y fijos — para responder la pregunta "¿cuántos
clientes de cada plan necesitamos para ser rentables, y a qué margen?".

Tampoco debe confundirse con `/admin/kpis` (KPIs reales del negocio): ese
panel es la contraparte 100% real de este — no proyecta ni simula nada,
consulta las tablas reales de la plataforma (organizaciones, activos,
auditorías, escaneos, hallazgos) para reportar rendimiento ya ejecutado.
En resumen: `/admin/costs` = gasto real; `/admin/internal-finops` =
ingresos y margen **simulados**; `/admin/kpis` = negocio **real y
ejecutado**, incluida la porción de ingresos (que hoy reporta 0/null
porque no hay pasarela de pagos conectada — ver ese panel para el detalle).

---

## 1. Objetivo

Construir una herramienta interna de simulación financiera que le permita a
la mesa ejecutiva:
- Ver el valor del día de la UF, la UTM y el Dólar observado, sin salir de
  la plataforma ni depender de una planilla externa desactualizada.
- Simular distintos escenarios de cartera de clientes (mezcla Starter/Pro)
  moviendo controles deslizantes, y ver el impacto en MRR, ARR, margen neto
  y punto de equilibrio al instante.
- Dimensionar el mercado potencial contra el universo de ~10.000 empresas
  chilenas afectas a la Ley N° 21.663 (Ley Marco de Ciberseguridad),
  fuente: datos abiertos del SII.
- Visualizar hacia dónde converge un escenario si se sostiene en el tiempo,
  vía una proyección acumulada a 12 meses.

---

## 2. Seguridad y acceso

- **Ruta protegida:** `/admin/internal-finops` (frontend) y
  `GET /api/v1/admin/internal-finops/projection` (backend) — ambos exigen
  sesión autenticada + `profiles.is_platform_admin = true`.
- **Adaptación de roles:** el prompt de diseño original pedía roles
  dedicados `super_admin` / `executive`. Aegis CyberAudit ya tiene
  `is_platform_admin` cumpliendo exactamente ese propósito (máximo
  privilegio, visibilidad cross-organización) y protegiendo el resto de
  `/admin/*` (costos, audit logs, gestión de organizaciones). Se reutilizó
  ese mismo flag (middleware `requirePlatformAdmin`) en vez de introducir un
  segundo sistema de roles paralelo solo para este panel — menos superficie
  de permisos que mantener, mismo nivel de exclusividad.
- Un usuario autenticado sin `is_platform_admin` recibe `403 Forbidden` al
  intentar acceder al endpoint, y la UI muestra un mensaje de acceso
  denegado en vez de la información financiera.
- Los datos de este panel (proyecciones, escenarios simulados) **nunca se
  exponen a organizaciones cliente** — es una vista interna, sin ninguna
  ruta ni tabla accesible desde el contexto de una organización normal.

---

## 3. Indicadores económicos en tiempo real

### 3.1 Fuente

`https://mindicador.cl/api` (API pública y gratuita del Banco Central / SII
de Chile). Se consultan tres valores:

| Indicador | Campo de la API | Uso en el motor |
|---|---|---|
| UF (Unidad de Fomento) | `uf.valor` | Convierte los precios de los planes (denominados en UF) a CLP |
| UTM (Unidad Tributaria Mensual) | `utm.valor` | Disponible en la respuesta del panel (referencia informativa) |
| Dólar observado | `dolar.valor` | Convierte los costos variables y fijos (denominados en USD) a CLP |

### 3.2 Estrategia de caché y resiliencia

Implementada en `src/services/economicIndicators.ts`, con la tabla
`system_economic_indicators` (migración `016_economic_indicators.sql`) como
respaldo persistente:

1. **Caché de 1 hora**: si el último valor guardado tiene menos de 1h de
   antigüedad, se sirve directo — evita golpear la API pública en cada
   carga del panel o cada vez que se mueve un slider.
2. **Fetch en vivo**: si el caché tiene más de 1h, se intenta una consulta
   en vivo a Mindicador.cl. Si responde, el valor se persiste y se sirve.
3. **Fallback automático**: si Mindicador.cl no responde (caído, timeout de
   8s, formato inesperado), se usa automáticamente el último valor guardado
   en `system_economic_indicators`, marcado `stale: true` en la respuesta.
   La UI lo refleja con un badge distinto ("Usando el último valor
   guardado" en vez de "Conectado a Mindicador.cl").
4. **Caso límite (primer arranque)**: si la tabla está vacía y la API está
   caída al mismo tiempo, el endpoint responde `503
   ECONOMIC_INDICATORS_UNAVAILABLE` en vez de inventar un valor.

### 3.3 Refresco programado (cron)

El diseño original pedía "un Cron Job diario (vía Vercel Cron o pg_cron)"
a las 08:00 AM. Este proyecto no se despliega en Vercel y no usa la
extensión `pg_cron` de Postgres — en su lugar, se adaptó al mismo mecanismo
de scheduling que ya usa la purga de retención (`worker:retention`): un Job
Scheduler de BullMQ.

- **Cola:** `src/jobs/economicIndicatorsQueue.ts` (`economic-indicators-refresh`)
- **Worker:** `src/jobs/economicIndicatorsWorker.ts` — proceso aparte,
  levantado con `npm run worker:economic-indicators`
- **Horario:** todos los días a las 08:00, zona horaria `America/Santiago`
- Este cron es una garantía *adicional* de frescura (para que exista un
  valor de hoy incluso si nadie abrió el panel). El propio endpoint ya se
  autoactualiza al vuelo por el mecanismo de caché descrito arriba, así que
  el panel funciona correctamente aunque el worker no esté corriendo — solo
  se pierde la garantía de que el primer request del día ya encuentre un
  valor fresco en caché.

---

## 4. Motor de cálculo financiero

Implementado como funciones puras en `src/services/finopsProjection.ts` —
no toca la base de datos, así que recalcular en cada movimiento de slider es
barato.

### 4.1 Fórmulas

**Ingreso Mensual Recurrente (MRR):**
```
MRR_CLP = (Clientes_Starter × Precio_Starter_UF + Clientes_Pro × Precio_Pro_UF) × Valor_UF
```
Valores por defecto: Starter = 1,5 UF/mes; Pro = 4,5 UF/mes (no editables
desde los sliders del panel en esta versión — ver sección 6, Limitaciones).

**ARR anualizado:**
```
ARR_CLP = MRR_CLP × 12
```

**Costos Variables Directos (COGS):**
```
COGS_CLP = Clientes_Totales × (Costo_Var_USD × Valor_Dólar)
```
Costo variable por defecto: USD $0,25/cliente/mes.

**Gastos Fijos Operacionales (OPEX):**
```
OPEX_CLP = OPEX_Fijo_USD × Valor_Dólar
```
Valor por defecto: USD $40/mes (Supabase Pro + Vercel/hosting + VPS de
workers) — ajustable con el slider "Costos fijos de servidor".

**Utilidad Neta Mensual:**
```
Ganancia_Neta_CLP = MRR_CLP − (OPEX_CLP + COGS_CLP)
Margen_Neto_% = Ganancia_Neta_CLP / MRR_CLP × 100   (0% si MRR = 0)
```

**Punto de equilibrio (Break-Even):**
Cantidad de clientes pagados (con la mezcla Starter/Pro actual) necesaria
para que el margen de contribución total cubra el 100% del OPEX fijo:
```
margen_contribución_por_cliente = (MRR_CLP / Clientes_Totales) − (Costo_Var_USD × Valor_Dólar)
Break_Even_Clientes = ceil(OPEX_CLP / margen_contribución_por_cliente)
```
Si no hay ningún cliente cargado en el escenario, se usa el margen de un
único cliente Starter como piso conservador. Si el margen de contribución
promedio es cero o negativo (escenario sin sentido económico dado el mix de
precios/costos), el panel muestra explícitamente "No alcanzable con este
escenario" en vez de un número negativo o infinito.

**Mercado direccionable:**
```
Clientes_Potenciales = 10.000 empresas (Ley 21.663, SII) × % de penetración simulado
```
Es una cifra informativa en paralelo a los sliders de clientes Starter/Pro
reales — no alimenta ninguna fórmula de ingreso, sirve como sanity-check de
"a qué % del mercado objetivo corresponde la cartera que estoy simulando".

### 4.2 Proyección a 12 meses

Simplificación deliberada: **run-rate constante**, sin curva de crecimiento
ni churn (el prompt de diseño original no especificaba un modelo de
crecimiento). Cada punto del mes *N* es simplemente:
```
Ingresos_mes_N   = MRR_CLP × N
Costos_mes_N     = (COGS_CLP + OPEX_CLP) × N
Utilidad_mes_N   = Ingresos_mes_N − Costos_mes_N
```
Sirve para visualizar hacia dónde converge el escenario actual si se
sostiene igual mes a mes — **no es un pronóstico de crecimiento real** de
la cartera de clientes. Ver Roadmap (sección 7) para la evolución natural
de este punto.

---

## 5. Interfaz del panel

1. **Barra de indicadores en vivo:** badges con el valor exacto del día de
   UF, UTM y Dólar, más un badge de estado de conexión — verde "Conectado a
   Mindicador.cl" si el valor tiene menos de 24h, ámbar "Usando el último
   valor guardado" si Mindicador.cl no respondió en la corrida más
   reciente — con la fecha/hora exacta del último valor.
2. **Panel de simulación de escenario (sliders):**
   - N° de clientes Plan Starter (0–500)
   - N° de clientes Plan Pro (0–500)
   - % de penetración del mercado objetivo del SII (0–100%)
   - Costos fijos de servidor / OPEX en USD (0–1.000)
   
   Cada cambio dispara un recálculo contra el backend con un debounce de
   300ms (evita una request por cada pixel arrastrado).
3. **Tarjetas de rentabilidad:** MRR (en CLP y UF), ARR anualizado, COGS,
   OPEX, Margen Neto %, y Punto de Equilibrio en clientes pagados.
4. **Gráfico de proyección a 12 meses:** líneas comparando Ingresos vs.
   Costos vs. Utilidad Neta acumulada (Recharts), con nota explícita de que
   es un run-rate constante y no una curva de crecimiento.

Interfaz bilingüe (español neutro / inglés), como el resto de la
plataforma.

---

## 6. Decisiones de arquitectura y desviaciones del diseño original

| Pedido originalmente | Implementado | Por qué |
|---|---|---|
| Tabla propia con RLS por organización | `system_economic_indicators` sin políticas para `authenticated`/`anon` (solo `service_role`) | Es un dato **global de la plataforma**, no por-organización — no hay ningún `organization_id` que filtrar. El mismo patrón "sin policy = solo service_role" que ya usan `scan_runs`, `invite_links` y `audit_logs`. |
| Roles `super_admin` / `executive` | Se reutiliza `is_platform_admin` | Ya existe un flag de máximo privilegio con el mismo propósito; duplicarlo como un rol Supabase nuevo agrega superficie sin agregar seguridad real. |
| Cron vía Vercel Cron o `pg_cron` | Job Scheduler de BullMQ (mismo mecanismo que `worker:retention`) | El proyecto no corre en Vercel y no usa la extensión `pg_cron`; se reusa la infraestructura de scheduling que ya existe en el backend en vez de introducir una tercera forma de programar tareas. |
| Endpoint `GET /api/admin/internal-projection` | `GET /api/v1/admin/internal-finops/projection` | Sigue la convención de versionado (`/api/v1`) y de agrupar rutas bajo `/admin/*` que ya usa el resto del backend (`adminCosts.ts`, `adminRouter`). |

---

## 7. Limitaciones conocidas / próximos pasos

- **Sin curva de crecimiento:** la proyección a 12 meses asume un run-rate
  constante. Una mejora natural sería agregar una tasa de crecimiento
  mensual de clientes y/o churn simulables como un slider adicional.
- **Precio por plan no editable desde el panel:** Starter (1,5 UF) y Pro
  (4,5 UF) están fijados como constantes del motor
  (`DEFAULT_PROJECTION_INPUTS` en `finopsProjection.ts`). Cambiarlos hoy
  requiere editar código, no la UI — se dejó así deliberadamente para no
  agregar sliders que el prompt de diseño original no pedía explícitamente,
  pero es la extensión más directa si la mesa ejecutiva necesita simular
  cambios de pricing.
- **El worker de refresco diario es un proceso aparte** del API (igual que
  `worker:scan` y `worker:retention`); en producción hace falta levantarlo
  por separado (o migrarlo a un cron real del hosting) para que la
  actualización de las 08:00 corra sola. No es bloqueante para el
  funcionamiento del panel — ver sección 3.3.
- **No hay histórico de escenarios guardados:** cada simulación es efímera
  (vive solo en el estado de los sliders del navegador); no hay forma de
  guardar/nombrar/comparar escenarios entre sesiones todavía.
- **UTM se obtiene y se muestra, pero no participa en ninguna fórmula** —
  quedó disponible en la respuesta del endpoint por si a futuro se necesita
  para cálculos tributarios (ej. proyección de impuestos), tal como lo pedía
  el prompt de diseño original, aunque el motor financiero actual no la usa.

---

## 8. Referencia rápida

| | |
|---|---|
| Ruta frontend | `/admin/internal-finops` |
| Endpoint backend | `GET /api/v1/admin/internal-finops/projection` |
| Servicio de indicadores | `src/services/economicIndicators.ts` |
| Motor de cálculo | `src/services/finopsProjection.ts` |
| Migración | `db/migrations/016_economic_indicators.sql` |
| Worker de refresco | `npm run worker:economic-indicators` |
| Fuente de datos externa | [mindicador.cl/api](https://mindicador.cl/api) |
