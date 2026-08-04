# 📊 EXECUTIVE BRIEF: AEGIS CYBERAUDIT
> **Última actualización:** 3 de agosto de 2026 | **Versión del Producto:** MVP+ (post Fase 3: FinOps y Compliance Enterprise)

---

### 1. 🎯 PROPUESTA DE VALOR Y MERCADO (Perspectiva CMO)
* **Producto:** Plataforma SaaS B2B de auditoría automatizada y gestión de cumplimiento en ciberseguridad, multi-tenant.
* **Problema:** Auditorías manuales lentas, costosas y difíciles de justificar ante reguladores, clientes o inversores.
* **Solución:** Automatización de ingesta de evidencias, escaneo activo de red/TLS/cabeceras HTTP, scoring de riesgo y reportes ejecutivos en PDF, con trazabilidad legal completa.
* **Público objetivo:** CISOs de PyMEs tecnológicas, consultores independientes de ciberseguridad y responsables de compliance que necesitan preparar evidencia auditable de forma recurrente.
* **Marcos normativos soportados:** ISO 27001, NIST CSF, GDPR y normativa local de protección de datos.
* **Diferenciadores clave:**
  * Trazabilidad legal inmutable (audit logs a prueba de alteración).
  * Protección de datos personales con purga autónoma (GDPR by design).
  * Desglose transparente de costos operativos por organización y por auditoría (FinOps).
  * Aislamiento multi-tenant garantizado a nivel de base de datos, no solo de aplicación.

---

### 2. 💰 MODELO ECONÓMICO Y FINOPS (Perspectiva CFO)
* **Estructura de costos de infraestructura:**
  * *Base de datos y autenticación:* Supabase PostgreSQL + Row Level Security (RLS).
  * *Storage:* buckets privados, evidencias cifradas en AES-256-GCM.
  * *Cómputo y tareas asíncronas:* workers en Node.js + BullMQ/Redis (escaneo de vulnerabilidades y purga de retención).
  * *Motor de escaneo:* Nmap + verificación de certificados TLS + cabeceras de seguridad HTTP.
  * *Generación de documentos:* motor de reportes PDF ejecutivos.
* **Visibilidad FinOps (`/admin/costs`):** cálculo de consumo prorrateado por organización y por auditoría individual, desglosado por servicio del stack. Incluye conversor de divisas (USD → CLP) y una unidad de facturación interna ("créditos"), ambos con tasa editable desde la propia interfaz sin intervención técnica. Las tarifas unitarias por proveedor también son editables para reflejar cambios de precio reales.
* **Nota de transparencia:** los costos mostrados son una **estimación** calculada a partir de uso real registrado (almacenamiento, escaneos, reportes, miembros) — no hay integración de facturación en vivo con los proveedores todavía.
* **Estrategia de monetización (modelo propuesto, no implementado en producto):**
  * *Plan Starter:* USD $49/mes — PyMEs pequeñas, límite de activos y auditorías.
  * *Plan Pro/Enterprise:* USD $149+/mes — activos ilimitados, retención GDPR personalizada y audit logs completos.
  * No existe todavía pasarela de cobro ni gating de funcionalidades por plan (ver Roadmap).

---

### 3. 🛡️ SEGURIDAD, COMPLIANCE Y RIESGO (Perspectiva CISO)
* **Aislamiento multi-tenant:** garantizado a nivel de motor de base de datos mediante PostgreSQL RLS filtrando por `organization_id` — un bug de aplicación no puede filtrar datos entre organizaciones.
* **No repudio e inmutabilidad:** tabla `audit_logs` con políticas de base de datos que impiden operaciones `UPDATE` y `DELETE` a cualquier rol (verificado activamente, no solo por diseño), asegurando validez ante auditorías externas ISO 27001. Registra automáticamente carga de evidencias, cambios de estado de hallazgos, generación/descarga de reportes, y cambios de rol u organización, con actor, IP y estado antes/después de cada cambio.
* **Gestión de privacidad (GDPR):** motor de retención con purga autónoma programada (diaria) que elimina el archivo binario de Storage al vencer el período configurado por cada organización, conservando el metadato (quién, cuándo) para fines legales.
* **Gestión de riesgos:**
  * Validación de evidencias en dos capas: estructural (magic bytes, rechaza archivos disfrazados) y semántica (campos obligatorios según el requisito normativo).
  * Flujo de revisión de hallazgos: marcar como Falso Positivo o Riesgo Aceptado exige justificación técnica obligatoria y queda atribuido al auditor responsable; ambos estados se excluyen del cálculo del puntaje de riesgo pero quedan documentados en el reporte.
* **Control de acceso:** RBAC por organización (`ciso` > `auditor` > `viewer`) más un rol de superadministrador de plataforma (`platform_admin`) separado, que nunca puede auto-otorgarse vía API.

---

### 4. 🚀 ESTADO DEL PRODUCTO Y ROADMAP (Perspectiva CPO)
* **Funcionalidades 100% implementadas:**
  * [x] Auth, onboarding y RBAC (`ciso`, `auditor`, `viewer`, `platform_admin`).
  * [x] CRUD de activos (IP, CIDR, dominio, repositorio Git, servidor cloud) con verificación de propiedad.
  * [x] Motor de escaneo de vulnerabilidades (Nmap + TLS + cabeceras HTTP), asíncrono vía cola de trabajos.
  * [x] Ingesta y validación de evidencias en dos capas, matriz de cobertura documental por framework.
  * [x] Scoring de riesgo y generación de reportes ejecutivos en PDF con descarga segura.
  * [x] Panel de administración de plataforma: gestión de organizaciones, roles y suspensión de cuentas.
  * [x] Audit logs inmutables, globales y por auditoría.
  * [x] Motor de retención y purga automática de evidencias (GDPR).
  * [x] Gestión de falsos positivos y riesgo aceptado con justificación obligatoria.
  * [x] Panel FinOps de costos de infraestructura, con conversión a pesos chilenos y créditos.
  * [x] Interfaz bilingüe (español neutro / inglés).
* **Limitaciones conocidas (pendientes):**
  * [ ] Falta botón de disparo manual de escaneo en el frontend (el endpoint ya existe).
  * [ ] Falta pasarela de pagos automática (Stripe / Mercado Pago) — el modelo de precios es propuesto, no cobrado.
  * [ ] Sin notificaciones automáticas por correo (Resend / SMTP) — ej. cuando termina un escaneo o vence una evidencia.
  * [ ] Sin flujo de "cambiar contraseña" ni "invitar a un compañero de equipo" (solo el primer usuario crea la organización).
  * [ ] El worker de purga por retención corre como proceso separado del API; en producción requiere despliegue propio (o un cron del hosting) para ejecutarse de forma confiable.
* **Siguiente sprint prioritario:** cerrar las brechas de autoservicio que bloquean la adopción sin intervención técnica — botón de escaneo manual e invitación de usuarios a la organización — antes de evaluar la integración de una pasarela de cobro real.

---

## 📈 Métricas de madurez del producto (referencia rápida)

| Indicador | Valor |
|---|---|
| Roles de acceso | 4 (`ciso`, `auditor`, `viewer`, `platform_admin`) |
| Marcos normativos soportados | 4 (ISO 27001, NIST CSF, GDPR, normativa local) |
| Tipos de activo auditable | 5 (IP, CIDR, dominio, repositorio Git, servidor cloud) |
| Módulos de administración de plataforma | 3 (organizaciones, audit logs, FinOps) |
| Idiomas de interfaz | 2 (español neutro, inglés) |
| Iteraciones de producto entregadas | 3 fases mayores tras el MVP inicial (activos/admin/escaneo → FinOps → compliance enterprise) |
