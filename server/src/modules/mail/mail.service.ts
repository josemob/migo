import { env } from '../../config/env';

/**
 * Correo transaccional con Resend (API REST, sin SDK). Nunca lanza: si no hay
 * RESEND_API_KEY configurada o la API falla, se registra y se omite el envío,
 * para no romper el flujo de negocio (registro, citas, facturación).
 */
export function mailConfigured(): boolean {
  return !!env.RESEND_API_KEY;
}

export interface MailAttachment {
  filename: string;
  /** Contenido en base64. */
  content: string;
}

export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: MailAttachment[];
}): Promise<boolean> {
  if (!mailConfigured()) {
    console.log('[mail] RESEND_API_KEY no configurada — se omite el envío a', params.to);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: params.to,
        subject: params.subject,
        html: params.html,
        ...(params.attachments?.length ? { attachments: params.attachments } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[mail] Resend respondió', res.status, detail.slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[mail] envío falló', e instanceof Error ? e.message : e);
    return false;
  }
}

const BRAND = '#8A2FA0';

// Envoltura HTML común (marca Migo). `body` es el contenido interno del correo.
function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F6F7F9;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1E293B">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="text-align:center;padding:8px 0 20px">
      <div style="display:inline-block;width:48px;height:48px;line-height:48px;border-radius:14px;background:${BRAND};color:#fff;font-size:24px;font-weight:800">M</div>
    </div>
    <div style="background:#fff;border-radius:16px;padding:28px;box-shadow:0 2px 12px rgba(127,57,138,.08)">
      <h1 style="margin:0 0 12px;font-size:20px;color:#1E293B">${title}</h1>
      ${body}
    </div>
    <p style="text-align:center;color:#94A3B8;font-size:12px;margin-top:20px">Migo · Cuidamos a quien más quieres, 24/7</p>
  </div></body></html>`;
}

const p = (text: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#334155">${text}</p>`;

export async function sendWelcomeEmail(to: string, name: string) {
  const first = name?.split(' ')[0] || 'Hola';
  return sendEmail({
    to,
    subject: '¡Bienvenido a Migo! 🐾',
    html: layout(`¡Bienvenido, ${first}!`,
      p('Tu cuenta en Migo ya está lista. Desde la app puedes registrar a tus mascotas, buscar clínicas cercanas, agendar citas y hablar con nuestra IA cuando tengas dudas.') +
      p('Gracias por confiarnos el cuidado de tu mejor amigo. 💜')),
  });
}

// Código para confirmar el correo nuevo (se envía al correo NUEVO).
export async function sendEmailChangeCodeEmail(to: string, name: string, code: string) {
  const first = name?.split(' ')[0] || '';
  return sendEmail({
    to,
    subject: `Tu código para cambiar el correo: ${code}`,
    html: layout('Confirma tu nuevo correo',
      p(`Hola${first ? ' ' + first : ''}, pediste usar este correo en tu cuenta de Migo. Escribe este código en la app:`) +
      `<div style="text-align:center;margin:18px 0"><span style="display:inline-block;font-size:30px;letter-spacing:8px;font-weight:800;color:${BRAND};background:#F5EBFA;border-radius:12px;padding:12px 20px">${code}</span></div>` +
      p('El código vence en 15 minutos. Si no fuiste tú, ignora este correo.')),
  });
}

// Aviso al correo ANTERIOR de que la cuenta cambió de correo.
export async function sendEmailChangedNoticeEmail(to: string, name: string, newEmail: string) {
  const first = name?.split(' ')[0] || '';
  return sendEmail({
    to,
    subject: 'El correo de tu cuenta Migo cambió',
    html: layout('Tu correo cambió',
      p(`Hola${first ? ' ' + first : ''}, el correo de tu cuenta de Migo ahora es <b>${newEmail}</b>.`) +
      p(`Si no fuiste tú, escríbenos de inmediato respondiendo a este correo.`)),
  });
}

export async function sendPasswordResetEmail(to: string, name: string, code: string) {
  const first = name?.split(' ')[0] || '';
  return sendEmail({
    to,
    subject: `Tu código para restablecer la contraseña: ${code}`,
    html: layout('Restablece tu contraseña',
      p(`Hola${first ? ' ' + first : ''}, recibimos una solicitud para restablecer tu contraseña. Usa este código en la app:`) +
      `<div style="text-align:center;margin:18px 0"><span style="display:inline-block;font-size:30px;letter-spacing:8px;font-weight:800;color:${BRAND};background:#F5EBFA;border-radius:12px;padding:12px 20px">${code}</span></div>` +
      p('El código vence en 15 minutos. Si no fuiste tú, ignora este correo — tu contraseña sigue segura.')),
  });
}

/** Escapa texto que viene de usuarios (nombres, direcciones) antes de meterlo en el HTML. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const button = (href: string, label: string) =>
  `<div style="text-align:center;margin:20px 0 8px"><a href="${href}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-weight:700;border-radius:999px;padding:12px 26px">${label}</a></div>`;

// ── Informe de consulta (expediente firmado, PDF adjunto) ─────────────

export async function sendRecordReportEmail(
  to: string,
  d: {
    petName: string; clinicName: string; dateLabel: string; reason?: string | null; diagnosis?: string | null;
    vetName?: string | null; message?: string; isOwner: boolean; ownerName: string; attachment: MailAttachment;
  },
) {
  const first = d.ownerName?.split(' ')[0] || '';
  const greeting = d.isOwner
    ? `Hola${first ? ' ' + esc(first) : ''}, ${esc(d.clinicName)} te envía el informe de la consulta de <b>${esc(d.petName)}</b>.`
    : `${esc(d.clinicName)} te comparte el informe de consulta de <b>${esc(d.petName)}</b> (tutor: ${esc(d.ownerName)}).`;
  const row = (label: string, value?: string | null) =>
    value ? `<div style="font-size:13px;color:#64748B">${label}</div><div style="font-weight:700;margin-bottom:8px">${esc(value)}</div>` : '';
  return sendEmail({
    to,
    subject: `Informe de consulta de ${d.petName} · ${d.clinicName}`,
    html: layout(`Informe de consulta de ${esc(d.petName)}`,
      p(greeting) +
      (d.message ? `<div style="border-left:3px solid ${BRAND};padding:6px 12px;margin:0 0 12px;color:#334155;font-size:14px;white-space:pre-line">${esc(d.message)}</div>` : '') +
      `<div style="background:#F5EBFA;border-radius:12px;padding:16px;margin:6px 0 12px">
        ${row('Fecha', d.dateLabel)}
        ${row('Motivo', d.reason)}
        ${row('Diagnóstico', d.diagnosis)}
        ${row('Firmado por', d.vetName)}
      </div>` +
      p('El informe completo, con el tratamiento y el récipe, va adjunto en PDF.')),
    attachments: [d.attachment],
  });
}

// ── Registro de clínicas ──────────────────────────────────────────────

/** A la clínica: recibimos su solicitud y queda en revisión. */
export async function sendClinicSignupReceivedEmail(to: string, name: string, clinicName: string) {
  const first = name?.split(' ')[0] || '';
  return sendEmail({
    to,
    subject: `Recibimos la solicitud de ${clinicName} 🐾`,
    html: layout('Tu solicitud está en revisión',
      p(`Hola${first ? ' ' + esc(first) : ''}, gracias por registrar <b>${esc(clinicName)}</b> en Migo.`) +
      p('Nuestro equipo revisará tus datos y el RIF. Mientras tanto ya puedes entrar al panel para completar tu perfil, horarios, servicios y equipo.') +
      p('Tu clínica aparecerá en la app para los dueños de mascotas en cuanto la aprobemos. Te avisaremos por este medio.') +
      button(env.VET_PANEL_URL, 'Entrar al panel')),
  });
}

/** Al equipo Migo: nueva solicitud pendiente de aprobar. */
export async function sendClinicSignupAdminEmail(
  to: string | string[],
  d: { clinicName: string; orgName: string; rif: string; city?: string | null; ownerName: string; ownerEmail: string },
) {
  return sendEmail({
    to,
    subject: `Nueva solicitud de clínica: ${d.clinicName}`,
    html: layout('Nueva clínica por aprobar',
      `<div style="background:#F5EBFA;border-radius:12px;padding:16px;margin:6px 0 12px;font-size:14px;line-height:1.6">
        <b>${esc(d.orgName)}</b> — ${esc(d.clinicName)}${d.city ? ` (${esc(d.city)})` : ''}<br>
        RIF: ${esc(d.rif)}<br>
        Responsable: ${esc(d.ownerName)} · ${esc(d.ownerEmail)}
      </div>` +
      p('Revisa los documentos y apruébala o recházala desde Gestión de Comercios.') +
      button(`${env.ADMIN_PANEL_URL}/comercios`, 'Revisar solicitud')),
  });
}

/** A la clínica: aprobada, ya visible en la app. */
export async function sendClinicApprovedEmail(to: string, name: string, clinicName: string) {
  const first = name?.split(' ')[0] || '';
  return sendEmail({
    to,
    subject: `¡${clinicName} ya está en Migo! ✅`,
    html: layout('¡Tu clínica fue aprobada!',
      p(`Hola${first ? ' ' + esc(first) : ''}, aprobamos <b>${esc(clinicName)}</b>. Desde ahora aparece en la app Migo y puede recibir solicitudes de cita y urgencias.`) +
      p('Revisa que tus horarios y servicios estén al día para que los dueños puedan agendar.') +
      button(env.VET_PANEL_URL, 'Ir al panel')),
  });
}

/** A la clínica: rechazada, con el motivo. */
export async function sendClinicRejectedEmail(to: string, name: string, clinicName: string, reason: string) {
  const first = name?.split(' ')[0] || '';
  return sendEmail({
    to,
    subject: `Sobre la solicitud de ${clinicName}`,
    html: layout('No pudimos aprobar tu solicitud',
      p(`Hola${first ? ' ' + esc(first) : ''}, revisamos la solicitud de <b>${esc(clinicName)}</b> y por ahora no pudimos aprobarla.`) +
      `<div style="background:#FEF2F2;border-radius:12px;padding:14px 16px;margin:6px 0 12px;font-size:14px;color:#991B1B"><b>Motivo:</b> ${esc(reason)}</div>` +
      p('Puedes corregirlo desde el panel (Configuración) y responder a este correo para que la revisemos de nuevo.') +
      button(env.VET_PANEL_URL, 'Ir al panel')),
  });
}

export async function sendAppointmentConfirmedEmail(
  to: string,
  name: string,
  d: {
    petName: string; clinicName: string; dateLabel: string; serviceName?: string | null;
    clinicAddress?: string | null; clinicPhone?: string | null; priceLabel?: string | null; vetName?: string | null;
  },
) {
  const first = name?.split(' ')[0] || '';
  const row = (label: string, value?: string | null, last = false) =>
    value
      ? `<div style="font-size:14px;color:#64748B">${label}</div><div style="font-weight:700;${last ? '' : 'margin-bottom:8px'}">${esc(value)}</div>`
      : '';
  return sendEmail({
    to,
    subject: `Tu cita en ${d.clinicName} fue aceptada ✅`,
    html: layout('¡Tu cita fue aceptada!',
      p(`Hola${first ? ' ' + esc(first) : ''}, ${esc(d.clinicName)} aceptó tu solicitud. Este es el resumen de tu cita:`) +
      `<div style="background:#F5EBFA;border-radius:12px;padding:16px;margin:6px 0 12px">
        ${row('Fecha y hora', d.dateLabel)}
        ${row('Mascota', d.petName)}
        ${row('Servicio', d.serviceName)}
        ${row('Precio', d.priceLabel)}
        ${row('Te atiende', d.vetName)}
        ${row('Clínica', d.clinicName)}
        ${row('Dirección', d.clinicAddress)}
        ${row('Teléfono', d.clinicPhone, true)}
      </div>` +
      p('Te esperamos. Si no puedes asistir, cancela la cita desde la app Migo para liberar el horario.')),
  });
}

export async function sendOwnerReceiptEmail(
  to: string,
  name: string,
  d: { number: string; concept: string; amountLabel: string; clinicName: string; dateLabel: string; petName?: string | null },
) {
  const first = name?.split(' ')[0] || '';
  return sendEmail({
    to,
    subject: `Recibo ${d.number} · ${d.clinicName}`,
    html: layout('Recibo de tu pago',
      p(`Hola${first ? ' ' + first : ''}, gracias por tu pago. Aquí está tu comprobante:`) +
      `<div style="background:#F5EBFA;border-radius:12px;padding:16px;margin:6px 0 12px">
        <div style="font-size:14px;color:#64748B">Recibo</div><div style="font-weight:700;margin-bottom:8px">${d.number}</div>
        <div style="font-size:14px;color:#64748B">Concepto</div><div style="font-weight:700;margin-bottom:8px">${d.concept}</div>
        ${d.petName ? `<div style="font-size:14px;color:#64748B">Mascota</div><div style="font-weight:700;margin-bottom:8px">${d.petName}</div>` : ''}
        <div style="font-size:14px;color:#64748B">Clínica</div><div style="font-weight:700;margin-bottom:8px">${d.clinicName}</div>
        <div style="font-size:14px;color:#64748B">Fecha</div><div style="font-weight:700;margin-bottom:8px">${d.dateLabel}</div>
        <div style="font-size:14px;color:#64748B">Total pagado</div><div style="font-weight:800;font-size:18px;color:${BRAND}">${d.amountLabel}</div>
      </div>` +
      p('Puedes ver y descargar este recibo desde la app Migo. ¡Gracias por confiar en nosotros! 💜')),
  });
}

export async function sendInvoiceReceiptEmail(
  to: string,
  name: string,
  d: { invoiceNumber: string; amountLabel: string; clinicName: string; dateLabel: string; concept?: string | null },
) {
  return sendEmail({
    to,
    subject: `Recibo de pago ${d.invoiceNumber} · Migo`,
    html: layout('Recibo de pago',
      p(`Hola ${name || ''}, confirmamos el pago de la siguiente factura:`) +
      `<div style="background:#F5EBFA;border-radius:12px;padding:16px;margin:6px 0 12px">
        <div style="font-size:14px;color:#64748B">Factura</div><div style="font-weight:700;margin-bottom:8px">${d.invoiceNumber}</div>
        ${d.concept ? `<div style="font-size:14px;color:#64748B">Concepto</div><div style="font-weight:700;margin-bottom:8px">${d.concept}</div>` : ''}
        <div style="font-size:14px;color:#64748B">Clínica</div><div style="font-weight:700;margin-bottom:8px">${d.clinicName}</div>
        <div style="font-size:14px;color:#64748B">Fecha</div><div style="font-weight:700;margin-bottom:8px">${d.dateLabel}</div>
        <div style="font-size:14px;color:#64748B">Total pagado</div><div style="font-weight:800;font-size:18px;color:${BRAND}">${d.amountLabel}</div>
      </div>` +
      p('Gracias por usar Migo. Este correo es tu comprobante de pago.')),
  });
}
