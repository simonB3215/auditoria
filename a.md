# PLAN DE IMPLEMENTACIÓN Y EJECUCIÓN TÉCNICA (MVP)

> **Instrucciones para la IA ejecutora:** Actúa como un Desarrollador Fullstack Senior y Especialista en Ciberseguridad. Tu objetivo es implementar el MVP de la plataforma de auditoría de ciberseguridad siguiendo estrictamente la arquitectura, el modelo de datos y las 4 fases detalladas a continuación. Cada módulo debe incluir manejo de errores, seguridad en los inputs y código modular en TypeScript/Node.js y Supabase.

---

## 🚀 FASE 1: Cimientos, Base de Datos y Autenticación (Sprint 1)

### Objetivo
Configurar el entorno base, desplegar el esquema de base de datos PostgreSQL con Row Level Security (RLS) en Supabase y establecer el sistema de autenticación JWT con control de acceso basado en roles (RBAC).

### Tareas de Implementación
1. **Setup Inicial del Proyecto:**
   * Crear la estructura de carpetas en Node.js / Express con TypeScript (`/src`: `config`, `controllers`, `services`, `middlewares`, `routes`, `types`).
   * Configurar `Helmet`, `CORS` restringido y `express-rate-limit`.
   * Inicializar el cliente oficial de Supabase mediante `@supabase/supabase-js`.
2. **Despliegue del Esquema de BD y RLS:**
   * Ejecutar el script SQL para crear las tablas: `profiles`, `assets`, `audits`, `audit_assets`, `audit_evidences`, `findings` y `reports`.
   * Habilitar RLS en todas las tablas y definir políticas donde `created_by = auth.uid()`.
3. **Middlewares de Seguridad:**
   * Crear `authenticateToken`: valida el JWT de Supabase extraído de los encabezados `Authorization: Bearer <token>`.
   * Crear `requireRole(['ciso', 'auditor'])`: valida los permisos del perfil almacenado en `profiles`.

---

## 📂 FASE 2: Ingesta de Evidencias, Validación y Matriz de Cobertura (Sprint 2 - Parte 1)

### Objetivo
Construir la API para la carga de evidencias y el **motor de validación** que detecte automáticamente si falta documentación o si los archivos subidos contienen errores.

### Tareas de Implementación
1. **Carga Segura de Archivos:**
   * Endpoint `POST /api/v1/audits/:id/evidences` utilizando `Multer` en memoria (sin escribir en disco).
2. **Capa 1: Validación Estructural (Sintaxis):**
   * Inspección de encabezados *Magic Bytes* (usando paquetes como `file-type`) para asegurar que el formato interno coincida con extensiones permitidas (`.pdf`, `.json`, `.xlsx`). Rechazar binarios no identificados o ejecutables.
3. **Capa 2: Validación Semántica y Cobertura:**
   * Crear el servicio `CoverageEngine` que compare las evidencias cargadas contra la lista de requisitos mínimos de la norma (ej: ISO 27001).
   * Validar que los archivos parseables (Excel/JSON) contengan los campos o columnas obligatorias (ej: IP, Criticidad, Responsable).
4. **Almacenamiento y Notificación:**
   * Subir archivos validados al Bucket privado de Supabase Storage con encriptación.
   * Retornar un objeto JSON con el cálculo de cobertura (`completion_percentage`), errores detectados y lista de requisitos pendientes (`missing_requirements`).

---

## ⚡ FASE 3: Motor de Escaneo y Gestión de Hallazgos (Sprint 2 - Parte 2)

### Objetivo
Integrar la ejecución de análisis de infraestructura y el registro de vulnerabilidades/hallazgos asociados a los activos de la organización.

### Tareas de Implementación
1. **Gestión de Activos (CRUD):**
   * Endpoints `POST /api/v1/assets` y `GET /api/v1/assets` con validación de sintaxis para direcciones IP, rangos CIDR y dominios.
2. **Motor de Escaneo Asíncrono:**
   * Endpoint `POST /api/v1/audits/:id/run-scan` que delegue las tareas de red/puertos a una cola de ejecución en segundo plano (usando BullMQ / Redis o procesos Worker).
3. **Normalización de Hallazgos:**
   * Transformar los resultados del escaneo (puertos abiertos, cifrados débiles, faltas de parches) e insertarlos en la tabla `findings` asignando la severidad correspondiente (`critical`, `high`, `medium`, `low`).

---

## 📊 FASE 4: Consolidación de Riesgos y Generación de Reportes (Sprint 3)

### Objetivo
Calcular la puntuación global de riesgo de la organización y generar un reporte ejecutivo descargable en formato PDF.

### Tareas de Implementación
1. **Algoritmo de Scoring (Ponderación de Riesgo):**
   * Implementar la función de cálculo de riesgo combinando el déficit de documentación con los hallazgos técnicos:
     $$\text{Puntaje} = 100 - (\sum \text{Hallazgos por Severidad} + \text{Penalización por Cobertura Incompleta})$$
2. **Generación de Reportes:**
   * Endpoint `GET /api/v1/audits/:id/report`.
   * Integración de una librería PDF (`pdfkit` o `puppeteer`) para renderizar un documento estructurado que incluya:
     * Resumen Ejecutivo (Score de Riesgo y Nivel de Cumplimiento).
     * Tabla de Evidencias Faltantes e Incoherencias Detectadas.
     * Desglose de Hallazgos y Sugerencias de Remediación.
3. **Hardening Final pre-despliegue:**
   * Revisión de variables de entorno, sanitización estricta de entradas en todas las rutas y pruebas E2E del flujo completo.