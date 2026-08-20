import { env } from '../../config/env';

/**
 * Correo transaccional con Resend (API REST, sin SDK). Nunca lanza: si no hay
 * RESEND_API_KEY configurada o la API falla, se registra y se omite el envío,
 * para no romper el flujo de negocio (registro, citas, facturación).
 */
export function mailConfigured(): boolean {
  return !!env.RESEND_API_KEY;
}

export async function sendEmail(params: { to: string | string[]; subject: string; html: string }): Promise<boolean> {
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
      body: JSON.stringify({ from: env.MAIL_FROM, to: params.to, subject: params.subject, html: params.html }),
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

export async function sendAppointmentConfirmedEmail(
  to: string,
  name: string,
  d: { petName: string; clinicName: string; dateLabel: string; serviceName?: string | null },
) {
  const first = name?.split(' ')[0] || '';
  return sendEmail({
    to,
    subject: `Cita confirmada en ${d.clinicName} ✅`,
    html: layout('¡Tu cita está confirmada!',
      p(`Hola${first ? ' ' + first : ''}, tu cita quedó confirmada. Estos son los detalles:`) +
      `<div style="background:#F5EBFA;border-radius:12px;padding:16px;margin:6px 0 12px">
        <div style="font-size:14px;color:#64748B">Mascota</div><div style="font-weight:700;margin-bottom:8px">${d.petName}</div>
        ${d.serviceName ? `<div style="font-size:14px;color:#64748B">Servicio</div><div style="font-weight:700;margin-bottom:8px">${d.serviceName}</div>` : ''}
        <div style="font-size:14px;color:#64748B">Clínica</div><div style="font-weight:700;margin-bottom:8px">${d.clinicName}</div>
        <div style="font-size:14px;color:#64748B">Fecha</div><div style="font-weight:700">${d.dateLabel}</div>
      </div>` +
      p('Te esperamos. Puedes ver o gestionar tu cita desde la app Migo.')),
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
