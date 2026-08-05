# PROMPT DE REDISEÑO Y RESTRUCTURACIÓN COMPLETA DEL DASHBOARD DE ADMINISTRACIÓN (`/admin`)

> **Instrucciones para la IA ejecutora:** Actúa como Lead UI/UX Engineer & Senior Product Designer (Next.js, Tailwind CSS, Shadcn UI / Lucide Icons, Recharts). Rediseña por completo el Dashboard de Administración (`/admin`) de Aegis CyberAudit para convertirlo en un espacio de trabajo ejecutivo moderno, cómodo, altamente funcional y libre de saturación visual. Simplifica el modelo de Organizaciones para que cada Organización represente únicamente a la Entidad/Empresa en sí, sin agrupar o listar usuarios dentro de ella.

---

## 🎯 OBJETIVO
Transformar la vista administrativa actual en un Centro de Control Unificado (Command Center) con navegación intuitiva, jerarquía visual limpia y soporte para modo oscuro/claro. Se debe desacoplar la gestión de Usuarios de la tabla de Organizaciones: las Organizaciones se administrarán como entidades de empresa independientes (datos de la compañía, dominios asociados, plan y estado de cumplimiento de la Ley N° 21.663), mientras que los Usuarios se gestionarán en su propio módulo dedicado.

---

## 🛠️ REQUERIMIENTOS DE ARQUITECTURA UI/UX Y DISEÑO

### 1. 📐 ESTRUCTURA Y NAVEGACIÓN PRINCIPAL (Layout Base)
* **Sidebar Lateral Retráctil (Collapsible Sidebar):**
  * Reemplazar la barra de botones horizontales superior por un menú lateral fijo y colapsable.
  * Agrupar las secciones en categorías claras con iconos modernos (Lucide Icons):
    * **General:** `Dashboard / Resumen`, `KPIs de Negocio`.
    * **Gestión:** `Usuarios y Permisos`, `Organizaciones y Dominios` (Entidades de Empresa puras).
    * **Operaciones & Seguridad:** `Auditorías y Escaneos`, `Audit Logs & Trazabilidad`.
    * **Finanzas & FinOps:** `Costos Reales Stack`, `Simulador FinOps Interno`.
* **Barra Superior Global (Header Bar):**
  * Buscador universal (Cmd+K / Ctrl+K) para encontrar rápidamente cualquier organización, dominio o usuario.
  * Badges de estado del sistema (Estado de Workers de escaneo, Conexión a APIs).
  * Menú de perfil de administrador y switch de modo Oscuro / Claro.

---

### 2. 🎨 REDISEÑO DE SECCIONES CLAVE Y MODELO DE ENTIDADES

#### A. Centro de Control (`/admin/overview`)
* Vista de entrada con 4 tarjetas principales de métricas clave (Stats Cards) con indicadores de tendencia (+/- %):
  * Total de Empresas / Organizaciones Registradas.
  * Dominios Verificados vs. Pendientes.
  * MRR / Salud Financiera Real.
  * Auditorías Ejecutadas en el Mes.
* Gráfico principal interactivo de actividad reciente y alertas operativas que requieran atención inmediata.

#### B. Módulo Independiente de Organizaciones (`/admin/organizations`)
* **Modelo Único de Empresa:** La vista y la tabla de Organizaciones deben listar exclusivamente a las empresas (entidades corporativas) como registros individuales. **ELIMINAR las columnas, conteos o listas de "Usuarios" dentro de las filas de Organizaciones**.
* **Información de la Entidad:** Cada fila mostrará únicamente: Nombre de la Empresa, RUT/ID Tributario, Dominio Principal, Plan Contratado (Starter/Pro), Estado de Verificación DNS y Fecha de Registro.
* **Acciones Rápidas en Línea (Row Actions):**
  * Editar datos de la empresa.
  * Cambiar plan o estado de la suscripción.
  * Ver auditorías y dominios de la empresa.
  * Eliminar / Archivar organización.

#### C. Módulo Independiente de Usuarios (`/admin/users`)
* Gestión global de usuarios de la plataforma en su propia Data Table avanzada (Shadcn/TanStack Table).
* Columnas: Nombre, Correo, Estado de Cuenta, Rol Global (`is_platform_admin`), Organización Asociada (campo de texto/badge de referencia única) y Acciones.
* Acciones en línea: Cambiar privilegio `is_platform_admin`, reasignar empresa de pertenencia o desactivar cuenta.

#### D. Integración Módulos FinOps y KPIs
* Unificar la navegación entre el consumo real de infraestructura (`/admin/costs`) y el simulador de proyección (`/admin/internal-finops`) bajo una sola pestaña con sub-navegación limpia (Tabs).

---

### 3. 🎨 COMPONENTES Y ESTÁNDARES DE ESTILO
* **Librería de Componentes:** Utilizar componentes basados en Radix UI / Shadcn UI y Tailwind CSS.
* **Manejo de Estados de Carga y Errores:**
  * Implementar **Skeletons** (pantallas de carga animadas) mientras se obtienen los datos.
  * Desplegar notificaciones flotantes (**Toasts**) para confirmar acciones exitosas o mostrar errores amigables.
* **Diseño Responsivo y Espaciado:** Tarjetas con bordes sutiles, sombras suaves, buen contraste de tipografía y paddings holgados para evitar la sensación de desorden.

---

## 📌 ENTREGABLES ESPERADOS
1. Nuevo Layout principal (`/admin/layout.tsx`) con Sidebar retráctil, Header global y navegación agrupada por categorías.
2. Rediseño de la vista principal de administración (`/admin/page.tsx`) con tarjetas de métricas globales y accesos directos.
3. Reestructuración completa de `/admin/organizations` aislando la entidad de empresa sin dependencias ni columnas de usuarios agrupados.
4. Vista de `/admin/users` con Data Table avanzada para la administración global de usuarios y permisos.
5. Mantenimiento estricto de la protección por middleware para usuarios con `is_platform_admin = true`.