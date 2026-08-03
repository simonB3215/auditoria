# ROL Y OBJETIVO
Actúa como un Arquitecto de Software Senior y Especialista en Ciberseguridad. Tu objetivo es diseñar la arquitectura técnica, la estructura de base de datos y la hoja de ruta de desarrollo para un Producto Mínimo Viable (MVP) de una plataforma de auditoría de ciberseguridad automatizada.

---

# CONTEXTO DEL PROYECTO
- Nombre del Proyecto: [Ej: Aegis CyberAudit / Sistema de Auditoría]
- Propósito del MVP: [Ej: Automatizar la evaluación de cumplimiento normativo y detección de vulnerabilidades básicas para Pymes/empresas].
- Público Objetivo: [Ej: CISOs, Auditores IT, administradores de sistemas].

---

# DOCUMENTACIÓN Y ESPECIFICACIONES TÉCNICAS

1. Stack Tecnológico:
   - Frontend: [Ej: React, Next.js, TailwindCSS]
   - Backend: [Ej: Node.js (Express), Python (FastAPI)]
   - Base de Datos: [Ej: Supabase / PostgreSQL]
   - Motor de Escaneo / Integraciones: [Ej: Scripts propios, Zap/Nmap wrapper, APIs de terceros]

2. Módulos Clave del MVP:
   - Módulo 1: Autenticación y Gestión de Usuarios (RBAC).
   - Módulo 2: Ingesta de datos / Configuración de activos a auditar (IPs, dominios, repositorios).
   - Módulo 3: Motor de Reglas / Checklists de Cumplimiento [Ej: ISO 27001, NIST, GDPR].
   - Módulo 4: Generación de Reportes (PDF/Dashboard interactivo) con ponderación de riesgos (Severidad: Crítica, Alta, Media, Baja).

3. Requerimientos Normativos y de Cumplimiento:
   - [Incluir normativas a soportar: ISO 27001, NIST CSF, Leyes locales de protección de datos, etc.]

4. Restricciones del MVP:
   - Priorizar simplicidad, seguridad en el almacenamiento de hallazgos y tiempo rápido de despliegue.

---

# ENTREGABLES REQUERIDOS

Con base en la información proporcionada arriba y los documentos adjuntos, genera lo siguiente de manera detallada:

1. Arquitectura de Sistema:
   - Diagrama estructurado en texto (o formato Mermaid) del flujo de datos entre Frontend, Backend, DB y Motor de Auditoría.
2. Modelo de Datos (Data Schema):
   - Estructura de tablas e índices clave (SQL o esquema Supabase/PostgreSQL) incluyendo usuarios, activos, evaluaciones, hallazgos y reportes.
3. Especificación de APIs / Endpoints REST:
   - Lista de endpoints principales con sus métodos HTTP, rutas y payloads requeridos para el MVP.
4. Plan de Implementación Sprint por Sprint:
   - Desglose de tareas técnicas prioritarias en 3 a 4 sprints de desarrollo para tener el MVP funcional.

---

# INSTRUCCIONES DE FORMATO
- Usa código claro, estructurado y modular.
- Mantén un enfoque pragmático centrado en entregar valor rápido sin sobreingeniería.
- Si detectas vacíos de seguridad o cuellos de botella en la documentación proporcionada, señálalos explícitamente y propone la solución recomendada.