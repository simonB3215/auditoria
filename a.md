# PROMPT DE AUDITORÍA Y LIMPIEZA DE INCONSISTENCIAS EN MODELO DE DATOS, UI Y FORMULARIOS

> **Instrucciones para la IA ejecutora:** Actúa como Senior Full-Stack Auditor & Refactoring Specialist (Next.js, Supabase PostgreSQL, TypeScript). Realiza una auditoría exhaustiva en la plataforma Aegis CyberAudit para detectar y eliminar datos fantasma, campos obsoletos en tablas de la UI, discrepancias entre formularios y la base de datos, y valores por defecto innecesarios (ej. columna "RUT / Sin RUT").

---

## 🎯 OBJETIVO
Alinear la base de datos, los controladores/endpoints del backend y los componentes de la interfaz de usuario para eliminar cualquier campo o columna que no corresponda a los formularios actuales o que genere desorden visual (como solicitar o mostrar un RUT cuando la plataforma no lo captura).

---

## 🛠️ REQUERIMIENTOS DE AUDITORÍA Y REFACTORIZACIÓN

### 1. 🧹 ELIMINACIÓN DE CAMPOS FANTASMA Y REMOCIÓN DEL RUT
* **Auditoría de UI en Organizaciones / Empresas:**
  * Eliminar la columna **"RUT"** (y el fallback *"Sin RUT"*) de las tablas administrativas (`/admin/organizations`, `/admin/users`, etc.).
  * Si en la base de datos (tabla `organizations`) existe la columna `tax_id` o `rut`, evaluarla: si no forma parte del flujo actual de onboarding, marcarla como opcional/deprecada o eliminarla de las consultas SELECT.
* **Revisión de Formularios vs. Tablas:**
  * Mapear todos los formularios de la plataforma (Registro, Ajustes de Perfil, Crear Organización, Agregar Dominio).
  * Garantizar que la tabla solo muestre columnas que correspondan estrictamente a datos capturados en la interfaz.

---

### 2. 🔍 DETECCIÓN Y CORRECCIÓN DE OTRAS INCONSISTENCIAS
Revisar y corregir los siguientes puntos críticos que suelen quedar desalineados:

1. **Campos "N/A", "Sin asignar" o "Sin RUT" recurrentes:**
   * Reemplazar textos estáticos de fallback por campos limpios, o simplemente eliminar esas columnas si no aportan valor directo a la administración.
2. **Discrepancia en Fechas y Marcas de Tiempo:**
   * Validar que los campos de fecha (`created_at`, `verified_at`, `last_sign_in_at`) se muestren en formato relativo o legible en español (ej. *"Hace 2 horas"*, *"05/08/2026"*) en lugar de imprimir cadenas ISO crudas o `null`.
3. **Mapeo Limpio de Enum/Estados:**
   * Garantizar que los estados de base de datos (ej. `is_verified: true/false`, `role: 'member'`) se traduzcan en la UI a badges limpios (ej. verde `✓ Verificado`, amarillo `Pendiente`) en lugar de mostrar booleanos o identificadores en inglés.

---

### 3. 🗄️ REFACTORIZACIÓN DE CONSULTAS Y TIPOS TYPESCRIPT
* **Tipos de TypeScript (`types/index.ts` o `types/supabase.ts`):** Actualizar los tipos de `Organization` y `User` para eliminar las propiedades en desuso (`rut`, `tax_id`, etc.) y evitar autocompletados erróneos en el código.
* **Consultas SQL / Supabase Client:** Ajustar las llamadas `.select(...)` para traer únicamente las columnas requeridas por los componentes de la UI, optimizando el rendimiento de la red.

---

## 📌 ENTREGABLES ESPERADOS
1. Eliminación de la columna "RUT" y textos "Sin RUT" en todas las vistas administrativas.
2. Informe/resumen breve de los campos y tipos TypeScript refactorizados.
3. Componentes de tabla (`DataTables`) limpios, mostrando únicamente la información real capturada en la plataforma.