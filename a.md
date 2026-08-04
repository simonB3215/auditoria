# PROMPT: MÓDULO DE COMPLIANCE, TRAZABILIDAD Y RETENCIÓN DE DATOS (FASE ENTERPRISE)

> **Instrucciones para la IA ejecutora:** Actúa como un Arquitecto de Software Senior y Especialista en Ciberseguridad/Compliance. Tu objetivo es implementar 3 características críticas de seguridad y cumplimiento normativo (ISO 27001, GDPR) dentro de la plataforma existente (Next.js 16, Express, Supabase RLS y PostgreSQL).

---

## 🛠️ MÓDULOS A IMPLEMENTAR

### 1. Sistema de Logs de Auditoría Inmutables (Audit Logs & Trazabilidad ISO 27001)

#### A. Base de Datos & RLS:
- Crear la tabla `audit_logs` en PostgreSQL con los campos: `id`, `organization_id`, `actor_id` (quién ejecutó la acción), `action` (ej: `EVIDENCE_APPROVED`, `FINDING_CRITICALITY_CHANGED`, `REPORT_DOWNLOADED`), `resource_type`, `resource_id`, `payload_before`, `payload_after`, `ip_address`, `user_agent`, `created_at`.
- **Política RLS Inmutable:** Habilitar RLS permitiendo solo operaciones `INSERT` y `SELECT`. Bloquear estrictamente operaciones `UPDATE` y `DELETE` en la tabla `audit_logs` para asegurar que el historial sea inalterable.

#### B. Middlewares e Interceptores Backend:
- Crear un servicio global `AuditLogger` que registre automáticamente en la BD cuando ocurran los siguientes eventos:
  1. Aprobación, rechazo o subida de evidencias.
  2. Modificación de la criticidad o sugerencia de un hallazgo.
  3. Generación y descarga de reportes ejecutivos PDF.
  4. Cambios en roles de usuarios o configuraciones de organización.

#### C. Frontend (`/audits/[id]/history` y `/admin/audit-logs`):
- Crear una pestaña o modal de "Historial de Cambios" dentro de cada auditoría para ver la línea de tiempo (*timeline*) de acciones ejecutadas por los usuarios con fecha, hora, IP y usuario responsable.

---

### 2. Políticas de Retención y Purga Automatizada de Datos (Data Retention / GDPR)

#### A. Configuración de Políticas de Retención (Backend / BD):
- Agregar el campo `retention_period_days` (ej. 30, 90, 365 días) en la tabla `organizations` o configuraciones de auditoría.
- Crear una función almacenada en PostgreSQL o un script de tarea programada (Cron Job / Worker de BullMQ) llamado `DataRetentionEngine`.

#### B. Motor de Purga Autónoma:
- El motor debe identificar registros y archivos de evidencias en Supabase Storage cuya antigüedad supere el periodo de retención configurado para la organización.
- Borrado seguro de archivos en Supabase Storage y marcado del estado del registro a `purged` en la BD (manteniendo el metadato del log para fines legales, pero eliminando el binario/documento sensible para cumplir con GDPR y privacidad).

#### C. Frontend (`/settings/retention`):
- Permitir a los usuarios con rol `ciso` o `admin` configurar el tiempo de vida máximo de sus evidencias subidas y ver el estado de almacenamiento/purga programada.

---

### 3. Gestión de Falsos Positivos y Riesgos Aceptados (Risk Management)

#### A. API Backend:
- Endpoint `PATCH /api/v1/findings/:id/status` que permita cambiar el estado de un hallazgo a: `active`, `false_positive`, o `risk_accepted`.
- Requerir obligatoriamente los campos: `justification_notes` (texto explicativo de la razón técnica) y `reviewed_by` (ID del auditor que lo autoriza).
- **Ajuste del Motor de Scoring:** Excluir automáticamente los hallazgos marcados como `false_positive` o `risk_accepted` del cálculo de la penalización del puntaje global de riesgo de la auditoría.

#### B. Frontend (`/audits/[id]/report`):
- En la tabla de hallazgos del reporte, agregar un menú de acción por cada vulnerabilidad: *"Marcar como Falso Positivo"* / *"Aceptar Riesgo"*.
- Modal de justificación técnica antes de confirmar la acción.
- Distinción visual con Badges de estado (ej: badge gris con ícono para "Falso Positivo" y badge amarillo con ícono para "Riesgo Aceptado").

---

## 📄 ENTREGABLES REQUERIDOS

1. Migration SQL para la tabla `audit_logs` con sus políticas de inmutabilidad (solo `INSERT`/`SELECT`) y campos de justificación en `findings`.
2. Código fuente del servicio `AuditLogger` y middlewares asociados en Express.
3. Worker/Cron Job para el motor de retención y purga segura de archivos en Supabase Storage.
4. Componentes y modales actualizados en la UI de Next.js (`/audits/[id]` y vista de reportes).