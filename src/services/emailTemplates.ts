/**
 * Secuencia de nurturing del Piloto Invitado (10 días) — ver a.md, sección
 * "SECUENCIA DE EMAIL NURTURING". Esto prepara el contenido real de los 3
 * correos (día 1, día 7, día 10) como funciones puras y testeables; NO hay
 * envío real conectado todavía (no hay proveedor SMTP/Resend configurado
 * en este entorno — ver README, "Limitaciones conocidas"). `sendGuestEmail`
 * queda como el único punto de integración: el día que se configure un
 * proveedor, se reemplaza su cuerpo por la llamada real sin tocar el
 * contenido de las plantillas.
 */

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export interface WelcomeEmailParams {
  recipientName: string;
  organizationName: string;
  appUrl: string;
}

export function buildWelcomeEmail(params: WelcomeEmailParams): EmailTemplate {
  const subject = `Bienvenido a Aegis CyberAudit — tu piloto de 10 días con ${params.organizationName} ya está activo`;
  const text =
    `Hola ${params.recipientName},\n\n` +
    `Ya tenés acceso temporal (10 días) a Aegis CyberAudit como Piloto Invitado de ${params.organizationName}.\n\n` +
    `Para empezar, te recomendamos: cargar tu primera evidencia o ejecutar tu primer escaneo de vulnerabilidades.\n\n` +
    `Entrar a la plataforma: ${params.appUrl}\n\n` +
    `— El equipo de Aegis CyberAudit`;
  const html =
    `<p>Hola ${params.recipientName},</p>` +
    `<p>Ya tenés acceso temporal (10 días) a Aegis CyberAudit como Piloto Invitado de <strong>${params.organizationName}</strong>.</p>` +
    `<p>Para empezar, te recomendamos <strong>cargar tu primera evidencia</strong> o <strong>ejecutar tu primer escaneo</strong> de vulnerabilidades.</p>` +
    `<p><a href="${params.appUrl}">Entrar a la plataforma</a></p>` +
    `<p>— El equipo de Aegis CyberAudit</p>`;
  return { subject, html, text };
}

export interface ProgressEmailParams {
  recipientName: string;
  coveragePercentage: number;
  daysRemaining: number;
  appUrl: string;
}

export function buildProgressEmail(params: ProgressEmailParams): EmailTemplate {
  const subject = `Tu piloto: ${params.coveragePercentage}% de cobertura — ${params.daysRemaining} días restantes`;
  const text =
    `Hola ${params.recipientName},\n\n` +
    `Llevás un ${params.coveragePercentage}% de cobertura documental sobre el marco normativo de tu auditoría (ISO 27001 / Ley 21.663).\n\n` +
    `Te quedan ${params.daysRemaining} días de acceso en este piloto.\n\n` +
    `Seguir cargando evidencia: ${params.appUrl}\n\n` +
    `— El equipo de Aegis CyberAudit`;
  const html =
    `<p>Hola ${params.recipientName},</p>` +
    `<p>Llevás un <strong>${params.coveragePercentage}%</strong> de cobertura documental sobre el marco normativo de tu auditoría (ISO 27001 / Ley 21.663).</p>` +
    `<p>Te quedan <strong>${params.daysRemaining} días</strong> de acceso en este piloto.</p>` +
    `<p><a href="${params.appUrl}">Seguir cargando evidencia</a></p>` +
    `<p>— El equipo de Aegis CyberAudit</p>`;
  return { subject, html, text };
}

export interface ExpirationEmailParams {
  recipientName: string;
  upgradeUrl: string;
  proPriceUsd: number;
}

export function buildExpirationEmail(params: ExpirationEmailParams): EmailTemplate {
  const subject = "Tu período de prueba de 10 días finalizó";
  const text =
    `Hola ${params.recipientName},\n\n` +
    `Tu acceso de Piloto Invitado pasó a solo lectura: ya no podés cargar evidencia, ejecutar escaneos ni modificar hallazgos.\n\n` +
    `Actualizá a Plan Pro (USD $${params.proPriceUsd}/mes) para reactivar permisos de escritura y escaneo, sin límite de activos.\n\n` +
    `Actualizar plan: ${params.upgradeUrl}\n\n` +
    `— El equipo de Aegis CyberAudit`;
  const html =
    `<p>Hola ${params.recipientName},</p>` +
    `<p>Tu acceso de Piloto Invitado pasó a solo lectura: ya no podés cargar evidencia, ejecutar escaneos ni modificar hallazgos.</p>` +
    `<p>Actualizá a <strong>Plan Pro (USD $${params.proPriceUsd}/mes)</strong> para reactivar permisos de escritura y escaneo, sin límite de activos.</p>` +
    `<p><a href="${params.upgradeUrl}">Actualizar plan</a></p>` +
    `<p>— El equipo de Aegis CyberAudit</p>`;
  return { subject, html, text };
}

export type GuestEmailEvent =
  | { kind: "welcome"; params: WelcomeEmailParams }
  | { kind: "progress"; params: ProgressEmailParams }
  | { kind: "expiration"; params: ExpirationEmailParams };

function renderGuestEmail(event: GuestEmailEvent): EmailTemplate {
  switch (event.kind) {
    case "welcome":
      return buildWelcomeEmail(event.params);
    case "progress":
      return buildProgressEmail(event.params);
    case "expiration":
      return buildExpirationEmail(event.params);
  }
}

/**
 * Punto único de envío. Sin `RESEND_API_KEY` configurada, no hay ningún
 * proveedor conectado — se limita a renderizar la plantilla y dejarla en
 * el log, para poder verificar el contenido sin depender de infraestructura
 * de correo real. TODO: cuando se configure Resend/SMTP, reemplazar el
 * bloque `else` por el POST real a la API del proveedor.
 */
export async function sendGuestEmail(to: string, event: GuestEmailEvent): Promise<void> {
  const template = renderGuestEmail(event);

  if (!process.env.RESEND_API_KEY) {
    console.log(`[email:not-configured] Para: ${to} | Asunto: ${template.subject}`);
    return;
  }

  // TODO: integrar Resend (o el SMTP que se elija) acá.
  console.log(`[email] Envío pendiente de implementar. Para: ${to} | Asunto: ${template.subject}`);
}

/**
 * Delegación a TI (a.md, sección "Flujo de Delegación a TI"): quien pide la
 * auditoría a menudo no tiene acceso al panel DNS de su propio dominio.
 * Este correo le da al equipo técnico todo lo necesario para crear el
 * registro sin tener que crear una cuenta en Aegis ni entender qué es una
 * "verificación de propiedad".
 */
export interface DomainDelegationEmailParams {
  requesterName: string;
  organizationName: string;
  domain: string;
  verificationToken: string;
  verifyUrl: string;
}

export function buildDomainDelegationEmail(params: DomainDelegationEmailParams): EmailTemplate {
  const txtValue = `aegis-site-verification=${params.verificationToken}`;
  const subject = "Requerimiento técnico: Validación de dominio para auditoría en Aegis CyberAudit";
  const text =
    `Hola,\n\n` +
    `${params.requesterName}, de ${params.organizationName}, solicitó una auditoría de ciberseguridad en Aegis CyberAudit ` +
    `y necesita demostrar la propiedad del dominio ${params.domain} para poder autorizar los escaneos técnicos ` +
    `(Ley N° 21.663 exige esta comprobación antes de escanear infraestructura de terceros).\n\n` +
    `Para autorizarlo, agregá el siguiente registro DNS en el panel de administración del dominio (Cloudflare, NIC Chile, GoDaddy, AWS, etc.):\n\n` +
    `  Tipo:   TXT\n` +
    `  Nombre: @ (raíz de ${params.domain})\n` +
    `  Valor:  ${txtValue}\n\n` +
    `Una vez creado el registro (puede tardar unos minutos en propagarse), ${params.requesterName} puede confirmar la verificación desde: ${params.verifyUrl}\n\n` +
    `— El equipo de Aegis CyberAudit`;
  const html =
    `<p>Hola,</p>` +
    `<p><strong>${params.requesterName}</strong>, de <strong>${params.organizationName}</strong>, solicitó una auditoría de ciberseguridad en Aegis CyberAudit ` +
    `y necesita demostrar la propiedad del dominio <strong>${params.domain}</strong> para poder autorizar los escaneos técnicos ` +
    `(la Ley N° 21.663 exige esta comprobación antes de escanear infraestructura de terceros).</p>` +
    `<p>Para autorizarlo, agregá el siguiente registro DNS en el panel de administración del dominio (Cloudflare, NIC Chile, GoDaddy, AWS, etc.):</p>` +
    `<table cellpadding="4" style="border-collapse:collapse;border:1px solid #ddd">` +
    `<tr><td><strong>Tipo</strong></td><td>TXT</td></tr>` +
    `<tr><td><strong>Nombre</strong></td><td>@ (raíz de ${params.domain})</td></tr>` +
    `<tr><td><strong>Valor</strong></td><td><code>${txtValue}</code></td></tr>` +
    `</table>` +
    `<p>Una vez creado el registro (puede tardar unos minutos en propagarse), ${params.requesterName} puede confirmar la verificación desde: <a href="${params.verifyUrl}">${params.verifyUrl}</a></p>` +
    `<p>— El equipo de Aegis CyberAudit</p>`;
  return { subject, html, text };
}

/**
 * Mismo patrón "preparado pero no conectado" que `sendGuestEmail`: sin
 * `RESEND_API_KEY` no hay proveedor real, así que se registra en consola
 * para poder verificar el contenido sin depender de infraestructura de
 * correo. Devuelve la plantilla renderizada para que la ruta pueda
 * auditarla (payload del evento) sin volver a construirla.
 */
export async function sendDomainDelegationEmail(to: string, params: DomainDelegationEmailParams): Promise<EmailTemplate> {
  const template = buildDomainDelegationEmail(params);

  if (!process.env.RESEND_API_KEY) {
    console.log(`[email:not-configured] Para: ${to} | Asunto: ${template.subject}`);
    return template;
  }

  // TODO: integrar Resend (o el SMTP que se elija) acá.
  console.log(`[email] Envío pendiente de implementar. Para: ${to} | Asunto: ${template.subject}`);
  return template;
}
