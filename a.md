# PROMPT DE IMPLEMENTACIÓN DE MVP: REGLAS DE NEGOCIO, AUTENTICACIÓN Y MEJORAS DE UX/UI

> **Instrucciones para la IA ejecutora:** Actúa como Principal Full-Stack Engineer & Lead Product Architect (Next.js App Router, Firebase Auth, Tailwind CSS, Resend/SendGrid, Supabase/PostgreSQL, Redis Worker). Implementa el siguiente plan de arquitectura y reglas de negocio para el MVP de Aegis CyberAudit, cubriendo notificaciones, límites, verificación de dominio TXT, reglas de autenticación y componentes UI en modo oscuro.

---

## 🎯 OBJETIVOS DE LA IMPLEMENTACIÓN
Consolidar las reglas operativas del MVP para mantener una infraestructura liviana, segura y enfocada en la privacidad de los usuarios, garantizando un flujo fluido desde la autenticación hasta la entrega de reportes.

---

## 📋 PLAN DE IMPLEMENTACIÓN PASO A PASO

### 1. 🔐 Autenticación & Control de Accesos (Firebase + Backend)
* **Auth Provider:** Implementar autenticación vía Firebase Auth (Email/Password + Google Sign-In).
* **Validación en Backend:** Sincronizar el `firebase_uid` con la tabla `users` en la base de datos principal mediante la validación de tokens JWT en las API Routes.
* **Modelo Single-Tenant (1 Usuario por Org):** Restringir la arquitectura del MVP a 1 usuario por organización (`owner_id`). Deshabilitar temporalmente la lógica de invitaciones y permisos granulares.

---

### 2. 🌐 Verificación de Dominio (TXT DNS Check)
* **Generación de Token TXT:** Generar una cadena única (`aegis-verification=[token]`) al registrar un dominio.
* **Flujo de Verificación:**
  * Crear el botón `[ 🔍 Verificar Dominio Ahora ]`.
  * Configurar hasta **5 reintentos automáticos en segundo plano** espaciados para gestionar la propagación DNS.
  * Mantener la solicitud activa durante 24 horas antes de marcarla como expirada.

---

### 3. 🛡️ Notificaciones, Alertas Críticas & Límites
* **Notificaciones por Email:** Integrar Resend (o SendGrid) para enviar un correo únicamente cuando:
  1. El escaneo pase a estado `"Completado"`.
  2. Se detecte al menos un hallazgo con severidad `"Crítica"`.
* **Límite de Activos (Rate Limiting):** Restringir cada cuenta a un **máximo de 3 a 5 activos registrados** (Dominios/IPs) en el plan de prueba/MVP.
* **Banner de Riesgo Crítico en Dashboard:** Si existe un hallazgo crítico activo, renderizar un banner destacado en rojo en el top del Dashboard alertando al usuario.

---

### 4. 🎛️ Falsos Positivos, Reportes & Disparador Manual
* **Ejecución de Escaneo:** Mantener el disparo de auditorías **100% manual por demanda** mediante botón (deshabilitar cronjobs automáticos en MVP).
* **Modal de Falsos Positivos Híbrido:** Al descartar una alerta, ofrecer un selector desplegable con opciones predefinidas (*"Riesgo Aceptado"*, *"Control Compensatorio Existente"*, *"Entorno de Pruebas"*) más un campo de texto libre opcional.
* **URLs de Descarga con Expiración:** Configurar almacenamiento para que las URLs firmadas públicas de los archivos PDF expiren exactamente en **1 hora**.

---

### 5. 🎨 Estilo Visual (Dark Mode Exclusivo)
* **Tema Visual Unificado:** Consolidar el diseño exclusivamente en **Modo Oscuro (Dark Mode)**, manteniendo la paleta de colores actual: fondo Slate/Navy profundo, acentos azul brillante para progreso/acciones y colores de riesgo estrictos (🔴 Rojo, 🟠 Naranja, 🟡 Amarillo, 🟢 Verde).

---

## 📌 ENTREGABLES ESPERADOS
1. Sincronización completa de Firebase Auth con la base de datos y middleware de protección de rutas.
2. Endpoint y lógica de verificación de registros TXT DNS con reintentos programados.
3. Integración de servicio de email para alertas de escaneo completado y hallazgos críticos.
4. Componente de modal híbrido para gestión de falsos positivos y restricción de activos a 5 máximos por cuenta.
5. Verificación de diseño 100% Dark Mode consolidado.