# PROMPT DE IMPLEMENTACIÓN: ROL Y FLUJO "PILOTO INVITADO (10 DÍAS)"

> **Instrucciones para la IA ejecutora:** Actúa como un Lead Full-Stack Software Engineer & Software Architect (Next.js, Express, Supabase PostgreSQL, RLS, Tailwind CSS). Implementa la función de "Piloto Invitado (10 Días)" en Aegis CyberAudit siguiendo rigurosamente el siguiente pliego de especificaciones técnicas, de seguridad y FinOps.

---

## 🎯 OBJETIVO DE LA TAREA
Habilitar un mecanismo de prueba B2B temporal de 10 días para usuarios invitados por administradores/CISOs, garantizando aislamiento multi-tenant por RLS, inmutabilidad de logs, degradación autónoma de permisos a `viewer` y límites estrictos de cómputo/almacenamiento.

---

## 🛠️ ESPECIFICACIONES TÉCNICAS Y REQUISITOS

### 1. 🗄️ BASE DE DATOS & RLS (Supabase PostgreSQL)
* **Tabla `organization_members`:**
  * Añadir/Asegurar la columna `expires_at` (TIMESTAMP WITH TIME ZONE).
  * Crear o actualizar el Enum de roles para incluir: `'ciso'`, `'auditor'`, `'auditor_guest'`, `'viewer'`.
* **Lógica de Expiración Autónoma:**
  * Implementar una función en PostgreSQL o una regla dentro del Worker diario que evalúe si `NOW() > expires_at` para usuarios con rol `auditor_guest`.
  * Al expirar, cambiar automáticamente el rol a `'viewer'`.
* **Políticas RLS:**
  * El rol `auditor_guest` debe estar filtrado estrictamente por `organization_id` (aislamiento multi-tenant).
  * `auditor_guest` tiene permisos de ESCRITURA condicionados a que `expires_at > NOW()`.
* **Inmutabilidad & Trazabilidad (ISO 27001 / GDPR):**
  * Toda acción (escaneos, carga de evidencias, cambios) debe insertar una fila inmutable en `audit_logs` registrando: `user_id`, `organization_id`, `action`, `ip_address`, `user_agent` y `timestamp`.
  * La tabla `audit_logs` debe mantener bloqueados los comandos `UPDATE` y `DELETE` para todos los roles.

---

### 2. ⚡ FINOPS & LIMITES DE USO (Lógica Backend / API)
* **Límite de Escaneos (Nmap / TLS / Headers):**
  * Imponer una cuota de **máximo 3 escaneos activos** por organización durante todo el periodo de trial de 10 días para el rol `auditor_guest`.
  * Endpoint `POST /audits/:id/run-scan` debe validar esta cuota antes de encolar en Redis/BullMQ.
* **Límite de Almacenamiento (Supabase Storage):**
  * Validar en el endpoint de subida de evidencias que el total consumido por la organización en trial no supere **100 MB**.

---

### 3. 🎨 INTERFAZ DE USUARIO & UX (Next.js / Tailwind CSS)
* **Modal / Flujo de Invitación:**
  * Permitir al usuario con rol `ciso` invitar a un consultor mediante email, marcando la casilla *"Acceso Temporal (10 Días)"*.
  * Generar un enlace mágico / token JWT de un solo uso para acceso directo sin fricciones.
* **Badge y Banner de Sesión:**
  * Si la sesión actual pertenece a un `auditor_guest`, desplegar en el Topbar un badge dinámico con el contador: `Rol: Piloto Invitado (X días restantes)`.
* **Estado Expirado (Degradación en UI):**
  * Cuando el trial caduque y el rol sea `viewer`, deshabilitar visualmente los botones de acción crítica (*"Cargar Evidencia"*, *"Ejecutar Escaneo"*, *"Modificar Estado"*).
  * Mostrar una alerta contextual al intentar hacer clic: *"El periodo de prueba de 10 días ha finalizado. Actualiza a Plan Pro para reactivar permisos de escritura y escaneo."*

---

### 4. 📧 SECUENCIA DE EMAIL NURTURING (Resend / SMTP)
Configurar o preparar las plantillas para los siguientes 3 eventos de correo:
1. **Día 1 (Bienvenida):** Enlace de acceso y Call-to-Action para ejecutar el primer escaneo/evidencia.
2. **Día 7 (Progreso):** Reporte de avance (% de cobertura ISO/Ley 21.663) y recordatorio de 3 días restantes.
3. **Día 10 (Expiración):** Notificación de degradación a lectura y CTA para actualizar a Plan Pro ($149 USD/mes).

---

## 📌 ENTREGABLES
1. Scripts SQL / Migraciones de Supabase (tablas, RLS, funciones/triggers de expiración).
2. Endpoints actualizados con controles de cuota FinOps (escaneos y storage).
3. Componentes UI en Next.js (Modal de invitación, Topbar Badge, deshabilitación de acciones).