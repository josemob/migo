// Placa QR: lo que se imprime o se graba. Funciones puras (sin React ni Expo),
// así se pueden probar y previsualizar fuera de la app.

// En mayúsculas a propósito: así el QR usa el modo alfanumérico, que ocupa menos
// módulos que el modo byte. Menos módulos = módulos más grandes = se lee mejor en
// una placa de 25 mm con rayones. El dominio no distingue mayúsculas, y la ruta
// /m/ del sitio tampoco.
export const qrPayload = (url: string) => url.toUpperCase();

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Hoja de impresión: medallas redondas en tres tamaños (las más comunes en
 * collares) y una tarjeta de 85×54 mm. Se recorta la que calce en la medalla.
 * El código va impreso debajo del QR: es el respaldo cuando el QR se raya.
 */
export function printHtml(petName: string, code: string, svg: string) {
  const nombre = escapeHtml(petName);
  const medalla = (d: number) => `
    <div class="medalla" style="width:${d}mm;height:${d}mm">
      <div class="qr" style="width:${(d * 0.62).toFixed(1)}mm;height:${(d * 0.62).toFixed(1)}mm">${svg}</div>
      <div class="cod" style="font-size:${(d * 0.075).toFixed(2)}mm">${code}</div>
    </div>`;
  const fila = (d: number) => `
    <div class="fila">
      <div class="etq">${d} mm</div>
      ${medalla(d)}${medalla(d)}${medalla(d)}
    </div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #1e293b; }
    h1 { font-size: 18pt; color: #3b1446; }
    .sub { font-size: 10pt; color: #64748b; margin: 4pt 0 12mm; line-height: 1.4; }
    .fila { display: flex; align-items: center; gap: 8mm; margin-bottom: 9mm; }
    .etq { width: 14mm; font-size: 9pt; color: #64748b; }
    .medalla { border: 0.25mm dashed #b8a4c4; border-radius: 50%; display: flex;
               flex-direction: column; align-items: center; justify-content: center; }
    .qr svg { width: 100%; height: 100%; display: block; }
    .cod { margin-top: 0.6mm; font-weight: 700; letter-spacing: 0.12em; }
    .tarjeta { width: 85mm; height: 54mm; border: 0.25mm dashed #b8a4c4; border-radius: 3mm;
               display: flex; align-items: center; gap: 5mm; padding: 5mm; margin-top: 4mm; }
    .tarjeta .qr { width: 40mm; height: 40mm; flex: 0 0 auto; }
    .tarjeta p { font-size: 8pt; color: #64748b; }
    .tarjeta .n { font-size: 15pt; font-weight: 700; color: #3b1446; margin: 1mm 0; }
    .tarjeta .c { font-size: 10pt; font-weight: 700; letter-spacing: 0.14em; color: #8a2fa0; }
    .tarjeta .w { margin-top: 3mm; }
  </style></head><body>
    <h1>Placa de ${nombre}</h1>
    <p class="sub">Recorta la medalla que calce en su collar por la línea punteada.
      Imprime al 100% (sin "ajustar a la página") para que los tamaños sean reales.</p>
    ${fila(25)}${fila(30)}${fila(35)}
    <div class="tarjeta">
      <div class="qr">${svg}</div>
      <div>
        <p>Si me encuentras, escanéame</p>
        <div class="n">${nombre}</div>
        <div class="c">${code}</div>
        <p class="w">migopet.app/m/${code}</p>
      </div>
    </div>
  </body></html>`;
}
