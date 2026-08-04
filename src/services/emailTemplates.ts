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
