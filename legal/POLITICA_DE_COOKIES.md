# Política de Cookies y Trazabilidad Web
## Aegis CyberAudit

> **Borrador de trabajo — v0.1.** Redactado con asistencia de IA a
> partir de la ficha técnica y factual del producto vigente al **24 de
> agosto de 2026**. No constituye asesoría legal ni un instrumento
> válido para su publicación sin revisión previa. Ver el **Aviso de
> Responsabilidad** al final del documento.

---

## 1. QUÉ SON LAS COOKIES Y TECNOLOGÍAS SIMILARES

Las cookies son pequeños archivos de texto que un sitio web almacena en
el navegador del usuario. Esta Política describe el uso que Aegis
CyberAudit (en adelante, **"Aegis"** o **"el Servicio"**) hace de
cookies y de tecnologías de almacenamiento equivalentes en el navegador
(por ejemplo, *local storage*).

---

## 2. HONESTIDAD TÉCNICA — DECLARACIÓN DE ALCANCE

**Declaración de estado real de la plataforma.** Aegis CyberAudit es una
aplicación web de tipo SaaS B2B orientada a un público profesional
(equipos de ciberseguridad y cumplimiento normativo), no un sitio de
consumo masivo. En su versión vigente al momento de redactar este
documento:

* el Servicio **no incorpora cookies ni scripts de publicidad de
  terceros**, ni de seguimiento (*tracking*) con fines de marketing o
  perfilamiento comercial;
* el Servicio **no utiliza cookies de redes sociales** (botones de
  compartir, píxeles de conversión) en su aplicación autenticada;
* el uso de almacenamiento en el navegador se limita a lo
  **estrictamente necesario** para el funcionamiento técnico de la
  sesión autenticada.

`[PLACEHOLDER: si el sitio público de marketing de Aegis (fuera de la
aplicación autenticada) utiliza herramientas de analítica web de
terceros — ej. Google Analytics — o cookies publicitarias, deben
declararse aquí con su finalidad, proveedor y duración exacta. Al
momento de redactar este borrador no se confirmó el uso de dichas
herramientas.]`

---

## 3. COOKIES Y ALMACENAMIENTO QUE SÍ UTILIZAMOS

| Nombre / tipo | Finalidad | Categoría | Duración |
|---|---|---|---|
| Cookie / token de sesión (Supabase Auth) | Mantener al usuario autenticado durante su sesión en la plataforma, sin la cual no es posible acceder a ninguna funcionalidad del Servicio. | **Estrictamente necesaria** | `[PLACEHOLDER: confirmar duración exacta configurada del token de sesión/refresh de Supabase Auth]` |
| Token de refresco (*refresh token*) | Renovar automáticamente la sesión del usuario sin requerir que vuelva a iniciar sesión manualmente. | **Estrictamente necesaria** | `[PLACEHOLDER: confirmar duración]` |
| Preferencia de idioma (es/en) | Recordar el idioma de interfaz elegido por el usuario. | **Funcional** | `[PLACEHOLDER: confirmar mecanismo de persistencia — local storage vs. cookie — y duración]` |
| Preferencia de tema visual (claro/oscuro) | Recordar la preferencia visual del usuario entre sesiones. | **Funcional** | `[PLACEHOLDER: confirmar mecanismo de persistencia y duración]` |
| Estado de interfaz (ej. tarjeta de bienvenida descartada en el panel principal) | Evitar mostrar nuevamente elementos de interfaz que el usuario ya cerró. | **Funcional** | Persistente en el navegador del usuario hasta que este borre los datos del sitio |

**Categorías utilizadas:**

* **Estrictamente necesarias**: imprescindibles para que el Servicio
  funcione (autenticación y sesión). No pueden desactivarse sin impedir
  el uso de la plataforma, y por tanto no requieren consentimiento
  previo bajo la normativa aplicable — sí requieren información clara,
  que es la que provee este documento.
* **Funcionales**: mejoran la experiencia de uso (idioma, tema visual,
  estado de interfaz), pero el Servicio puede funcionar sin ellas,
  reiniciando dichas preferencias.

**Lo que explícitamente no existe en esta tabla**: cookies de
publicidad, cookies de seguimiento entre sitios (*cross-site
tracking*), ni cookies de analítica de comportamiento de terceros dentro
de la aplicación autenticada.

---

## 4. GESTIÓN DE COOKIES POR EL USUARIO

4.1. Dado que las cookies estrictamente necesarias son indispensables
para el funcionamiento de la sesión autenticada, **desactivarlas desde
la configuración del navegador impedirá el uso del Servicio**.

4.2. El usuario puede eliminar en cualquier momento las cookies y datos
de almacenamiento local asociados al Servicio desde la configuración de
su propio navegador. Esto cerrará su sesión activa y restablecerá sus
preferencias funcionales (idioma, tema visual, estado de interfaz) a los
valores por defecto.

---

## 5. TERCEROS Y SUBPROCESADORES TÉCNICOS

El almacenamiento de sesión descrito en esta Política es gestionado
técnicamente por Supabase Auth, proveedor de infraestructura de
autenticación de Aegis. El detalle completo de los proveedores de
infraestructura utilizados por el Servicio, y su rol respecto de los
datos personales, se encuentra en el Anexo I del Acuerdo de Tratamiento
de Datos (DPA) y en la Política de Privacidad.

---

## 6. CAMBIOS A ESTA POLÍTICA

Si en el futuro el Servicio incorpora cookies de analítica, publicidad o
seguimiento de terceros no descritas en esta versión, Aegis actualizará
este documento e implementará el mecanismo de consentimiento previo que
corresponda conforme a la normativa aplicable en cada jurisdicción,
antes de activar dichas cookies.
`[PLACEHOLDER: definir mecanismo de notificación de cambios materiales a esta Política, ej. aviso en la plataforma]`.

---

## AVISO DE RESPONSABILIDAD

Este documento es un **borrador de trabajo** generado con asistencia de
inteligencia artificial. **No constituye asesoría legal**, no ha sido
revisado ni validado por un abogado habilitado, y **no debe utilizarse
ni publicarse sin la revisión y validación previa de un profesional del
derecho** especializado en protección de datos personales y normativa de
cookies/*ePrivacy*, tanto en la jurisdicción chilena como, si
corresponde, en la Unión Europea. Los campos marcados como
`[PLACEHOLDER: ...]` identifican información técnica no confirmada al
momento de redactar este borrador — en particular, deben verificarse
contra la implementación real antes de publicar este documento.
