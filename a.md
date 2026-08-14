# PROMPT DE IMPLEMENTACIÓN: MODULO DE SIMULACIÓN (SANDBOX) Y GENERACIÓN DE INFORME TÉCNICO COMPLETO

> **Instrucciones para la IA ejecutora:** Actúa como Full-Stack Engineer especialista en Next.js, Supabase y generación de documentos PDF (ej: `@react-pdf/renderer` o `jspdf`). Implementa en Aegis CyberAudit un flujo de simulación interactivo que permita crear datos de prueba con un clic, probar el descarte de falsos positivos, descargar un informe completo recopilatorio y limpiar la simulación.

---

## 🛠️ REQUERIMIENTOS TÉCNICOS

### 1. 🧪 BOTÓN "EJECUTAR SIMULACIÓN" (`/audits/sandbox`)
* **Acción:** Un botón visible `[ 🧪 Cargar Escaneo de Prueba ]` en el Dashboard/Auditorías.
* **Lógica Backend:**
  * Crear una auditoría de prueba vinculada al dominio ficticio `demo-seguridad.cl`.
  * Generar 3 hallazgos predeterminados con diferentes niveles de criticidad (Crítica, Alta, Media) y su estado de cumplimiento Ley 21.663 (ANCI).
  * Permitir al usuario interactuar libremente marcando falsos positivos.

---

### 2. 📄 GENERADOR DE INFORME RECOPILATORIO (PDF / REPORT)
* **Acción:** Botón `[ 📄 Descargar Reporte de Auditoría ]`.
* **Contenido del Documento Entregable:**
  * **Portada y Resumen Ejecutivo:** Puntaje de salud global (0-100) y resumen de la infraestructura evaluada.
  * **Cumplimiento Normativo:** Matriz de controles evaluados según la **Ley 21.663 (ANCI)** (`ok` / `fail`).
  * **Detalle de Hallazgos y Errores:** Lista técnica de vulnerabilidades detectadas en el escaneo de red.
  * **Sección de Falsos Positivos y Excepciones:** Cuadro detallado con las alertas marcadas como falso positivo, el usuario que las descartó y la nota de justificación guardada.

---

### 3. 🗑️ BOTÓN "ELIMINAR DATOS SIMULADOS"
* **Acción:** Botón `[ 🗑️ Limpiar Simulación ]` (con confirmación mediante modal).
* **Lógica Backend:**
  * Eliminar el registro `audit_id` generado por la simulación de las tablas `audits`, `scan_runs` y `exceptions_whitelist` para restablecer el Dashboard a su estado limpio.

---

## 📌 ENTREGABLES ESPERADOS
1. Botones de UI para `Cargar Simulación`, `Descargar Informe` y `Limpiar Simulación`.
2. Endpoint API o Server Action para poblar y limpiar la base de datos con datos de prueba.
3. Módulo de exportación PDF que incluya el desglose de vulnerabilidades y la bitácora de falsos positivos.