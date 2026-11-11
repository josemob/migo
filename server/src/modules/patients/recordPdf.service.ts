import path from 'node:path';
import PDFDocument from 'pdfkit';
import { prisma } from '../../config/prisma';
import { MIGO_LOGO_PATHS, MIGO_LOGO_VIEWBOX } from '../../lib/migoLogo';

/**
 * Informe de consulta en PDF (el mismo para "Descargar" y para el adjunto del correo).
 * Diseño Migo: banda morada con el logo, tipografía Outfit, secciones limpias.
 * Si el expediente no está firmado lleva la marca "BORRADOR – SIN FIRMAR".
 */

const FONTS = path.resolve(__dirname, '../../../assets/fonts');
const C = {
  purple: '#7F398A',
  deep: '#2A0F33',
  yellow: '#FFE921',
  text: '#1E293B',
  muted: '#64748B',
  faint: '#94A3B8',
  line: '#E2E8F0',
  soft: '#F7F2FA',
  green: '#2EA84F',
  amber: '#B45309',
  amberBg: '#FEF3C7',
};

const SPECIES: Record<string, string> = {
  DOG: 'Perro', CAT: 'Gato', BIRD: 'Ave', RABBIT: 'Conejo', REPTILE: 'Reptil', RODENT: 'Roedor', OTHER: 'Otra especie',
};
const SEX: Record<string, string> = { MALE: 'Macho', FEMALE: 'Hembra', UNKNOWN: '—' };

/** Carga el expediente con todo lo que lleva el informe. null si no es de esta clínica. */
export async function loadRecordForReport(recordId: string, clinicId: string) {
  return prisma.medicalRecord.findFirst({
    where: { id: recordId, clinicId },
    include: {
      pet: {
        select: {
          name: true, species: true, breed: true, sex: true, birthDate: true, microchip: true,
          owner: { select: { fullName: true, email: true, phone: true } },
        },
      },
      prescriptions: { orderBy: { createdAt: 'asc' } },
      clinic: { select: { name: true, address: true, city: true, phone: true, email: true } },
      vet: { select: { user: { select: { fullName: true } } } },
    },
  });
}
export type ReportRecord = NonNullable<Awaited<ReturnType<typeof loadRecordForReport>>>;

const VE_TZ = 'America/Caracas';
export const longDate = (d: Date) =>
  d.toLocaleDateString('es-VE', { timeZone: VE_TZ, day: 'numeric', month: 'long', year: 'numeric' });
const dateTime = (d: Date) =>
  `${longDate(d)}, ${d.toLocaleTimeString('es-VE', { timeZone: VE_TZ, hour: 'numeric', minute: '2-digit' })}`;

/** 6.4 -> '6,4' (formato venezolano). */
const num = (v: unknown) => Number(v).toLocaleString('es-VE', { maximumFractionDigits: 2 });

function ageLabel(birth: Date | null): string | null {
  if (!birth) return null;
  const months = Math.floor((Date.now() - birth.getTime()) / (30.44 * 24 * 3600 * 1000));
  if (months < 1) return 'Menos de 1 mes';
  if (months < 12) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  const y = Math.floor(months / 12);
  return `${y} ${y === 1 ? 'año' : 'años'}`;
}

/** Nombre de archivo legible: "Informe-Toddy-2026-09-01.pdf". */
export function reportFileName(r: ReportRecord): string {
  const pet = r.pet.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mascota';
  return `Informe-${pet}-${r.visitedAt.toISOString().slice(0, 10)}.pdf`;
}

export function buildRecordPdf(r: ReportRecord): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 48, bottom: 56, left: 48, right: 48 },
      bufferPages: true,
      info: { Title: `Informe de consulta · ${r.pet.name}`, Author: r.clinic?.name ?? 'Migo', Creator: 'Migo' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('R', path.join(FONTS, 'Outfit_400Regular.ttf'));
    doc.registerFont('SB', path.join(FONTS, 'Outfit_600SemiBold.ttf'));
    doc.registerFont('XB', path.join(FONTS, 'Outfit_800ExtraBold.ttf'));

    const W = doc.page.width;
    const L = doc.page.margins.left;
    const CW = W - L - doc.page.margins.right;
    const bottomLimit = () => doc.page.height - doc.page.margins.bottom;
    const ensure = (h: number) => {
      if (doc.y + h > bottomLimit()) doc.addPage();
    };
    const signed = !!r.signedAt;

    // ── Banda superior ─────────────────────────────────────────────
    const bandH = 96;
    doc.rect(0, 0, W, bandH).fill(C.purple);
    const logoH = 40;
    const s = logoH / MIGO_LOGO_VIEWBOX.h;
    doc.save().translate(L, (bandH - logoH) / 2).scale(s);
    for (const p of MIGO_LOGO_PATHS) doc.path(p.d).fill(p.bubble ? C.yellow : '#FFFFFF', 'even-odd');
    doc.restore();

    const clinicLines = [
      r.clinic?.address ? [r.clinic.address, r.clinic.city].filter(Boolean).join(', ') : r.clinic?.city,
      [r.clinic?.phone, r.clinic?.email].filter(Boolean).join(' · '),
    ].filter(Boolean) as string[];
    const rightX = L + 150;
    const rightW = CW - 150;
    let ry = 30;
    doc.font('SB').fontSize(13).fillColor('#FFFFFF').text(r.clinic?.name ?? 'Clínica veterinaria', rightX, ry, { width: rightW, align: 'right' });
    ry = doc.y + 2;
    doc.font('R').fontSize(9).fillColor('#FFFFFF').fillOpacity(0.8);
    for (const line of clinicLines) {
      doc.text(line, rightX, ry, { width: rightW, align: 'right' });
      ry = doc.y;
    }
    doc.fillOpacity(1);

    // ── Título ─────────────────────────────────────────────────────
    doc.y = bandH + 26;
    doc.font('XB').fontSize(24).fillColor(C.deep).text('Informe de consulta', L, doc.y);
    doc.font('R').fontSize(11).fillColor(C.muted).text(dateTime(r.visitedAt), L, doc.y + 2);
    const afterTitle = doc.y;
    if (!signed) {
      const label = 'BORRADOR – SIN FIRMAR';
      doc.font('SB').fontSize(9);
      const bw = doc.widthOfString(label) + 20;
      const by = bandH + 32;
      doc.roundedRect(L + CW - bw, by, bw, 22, 11).fill(C.amberBg);
      doc.fillColor(C.amber).text(label, L + CW - bw, by + 6.5, { width: bw, align: 'center' });
    }
    doc.y = afterTitle + 16;

    // ── Paciente (tarjeta) ─────────────────────────────────────────
    const facts: [string, string | null][] = [
      ['Paciente', r.pet.name],
      ['Especie / raza', [SPECIES[r.pet.species] ?? null, r.pet.breed].filter(Boolean).join(' · ') || null],
      ['Sexo', SEX[r.pet.sex] ?? null],
      ['Edad', ageLabel(r.pet.birthDate)],
      ['Tutor', r.pet.owner.fullName],
      ['Microchip', r.pet.microchip],
    ];
    const shown = facts.filter(([, v]) => v && v !== '—') as [string, string][];
    const cols = 3;
    const colW = (CW - 32) / cols;
    const rowH = 38;
    const cardH = 20 + Math.ceil(shown.length / cols) * rowH;
    const cardY = doc.y;
    doc.roundedRect(L, cardY, CW, cardH, 14).fill(C.soft);
    shown.forEach(([k, v], i) => {
      const x = L + 16 + (i % cols) * colW;
      const y = cardY + 14 + Math.floor(i / cols) * rowH;
      doc.font('SB').fontSize(7.5).fillColor(C.faint).text(k.toUpperCase(), x, y, { width: colW - 8, characterSpacing: 0.6 });
      doc.font('SB').fontSize(11).fillColor(C.text).text(v, x, y + 11, { width: colW - 8, ellipsis: true, lineBreak: false });
    });
    doc.y = cardY + cardH + 18;

    // ── Signos ─────────────────────────────────────────────────────
    const vitals: [string, string][] = [];
    if (r.weightKg != null) vitals.push(['Peso', `${num(r.weightKg)} kg`]);
    if (r.temperature != null) vitals.push(['Temperatura', `${num(r.temperature)} °C`]);
    if (vitals.length) {
      let x = L;
      const y = doc.y;
      for (const [k, v] of vitals) {
        doc.font('SB').fontSize(7.5).fillColor(C.faint).text(k.toUpperCase(), x, y, { characterSpacing: 0.6, lineBreak: false });
        doc.font('XB').fontSize(16).fillColor(C.deep).text(v, x, y + 11, { lineBreak: false });
        x += 140;
      }
      doc.y = y + 38;
    }

    // ── Secciones clínicas ─────────────────────────────────────────
    const section = (title: string, body?: string | null) => {
      if (!body?.trim()) return;
      doc.font('R').fontSize(11);
      const h = doc.heightOfString(body.trim(), { width: CW });
      ensure(Math.min(h, 60) + 24);
      doc.font('SB').fontSize(8).fillColor(C.purple).text(title.toUpperCase(), L, doc.y, { characterSpacing: 0.8 });
      doc.moveDown(0.25);
      doc.font('R').fontSize(11).fillColor(C.text).text(body.trim(), L, doc.y, { width: CW, lineGap: 2 });
      doc.moveDown(0.8);
    };
    section('Motivo de la consulta', r.reason);
    section('Síntomas', r.symptoms);
    section('Diagnóstico', r.diagnosis);
    section('Tratamiento', r.treatment);
    section('Notas', r.notes);

    // ── Récipe ─────────────────────────────────────────────────────
    if (r.prescriptions.length) {
      ensure(60);
      doc.font('SB').fontSize(8).fillColor(C.purple).text('RÉCIPE', L, doc.y, { characterSpacing: 0.8 });
      doc.moveDown(0.5);
      for (const p of r.prescriptions) {
        const meta = [
          p.dose && `Dosis: ${p.dose}`,
          p.frequency && `Frecuencia: ${p.frequency}`,
          p.durationDays && `Duración: ${p.durationDays} días`,
        ].filter(Boolean).join('   ·   ');
        doc.font('R').fontSize(10);
        const metaH = meta ? doc.heightOfString(meta, { width: CW - 28 }) : 0;
        const instH = p.instructions ? doc.heightOfString(p.instructions, { width: CW - 28 }) + 4 : 0;
        doc.font('SB').fontSize(11.5);
        const drugH = doc.heightOfString(p.drug, { width: CW - 28 });
        const boxH = 12 + drugH + (meta ? metaH + 4 : 0) + instH + 12;
        ensure(boxH + 8);
        const y = doc.y;
        doc.roundedRect(L, y, CW, boxH, 10).lineWidth(1).strokeColor(C.line).stroke();
        doc.rect(L, y + 10, 3, boxH - 20).fill(C.purple);
        doc.font('SB').fontSize(11.5).fillColor(C.text).text(p.drug, L + 14, y + 12, { width: CW - 28 });
        let iy = doc.y + 2;
        if (meta) {
          doc.font('R').fontSize(10).fillColor(C.muted).text(meta, L + 14, iy, { width: CW - 28 });
          iy = doc.y + 2;
        }
        if (p.instructions) doc.font('R').fontSize(10).fillColor(C.muted).text(p.instructions, L + 14, iy, { width: CW - 28 });
        doc.y = y + boxH + 8;
      }
      doc.moveDown(0.6);
    }

    // ── Firma ──────────────────────────────────────────────────────
    ensure(66);
    doc.moveTo(L, doc.y).lineTo(L + CW, doc.y).lineWidth(1).strokeColor(C.line).stroke();
    doc.moveDown(0.8);
    if (signed) {
      const vetName = r.signedByName ?? r.vet?.user.fullName ?? 'Médico veterinario';
      doc.font('SB').fontSize(8.5).fillColor(C.green).text('FIRMADO DIGITALMENTE', L, doc.y, { characterSpacing: 0.6 });
      doc.font('SB').fontSize(12.5).fillColor(C.text).text(vetName, L, doc.y + 2);
      const sub = [r.signedBySpecialty, r.signedByLicense && `Colegiado N.º ${r.signedByLicense}`].filter(Boolean).join(' · ');
      if (sub) doc.font('R').fontSize(10).fillColor(C.muted).text(sub, L, doc.y);
      doc.font('R').fontSize(9).fillColor(C.faint).text(`${dateTime(r.signedAt!)}${r.clinic?.name ? ` · ${r.clinic.name}` : ''}`, L, doc.y + 2);
    } else {
      doc.font('SB').fontSize(10).fillColor(C.amber).text('Documento sin firmar', L, doc.y);
      doc.font('R').fontSize(9.5).fillColor(C.muted).text(
        'Este informe es un borrador: no tiene validez hasta que el veterinario tratante lo firme.',
        L, doc.y + 2, { width: CW },
      );
    }

    // ── Pie y marca de agua en cada página ─────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // El pie va por debajo del margen inferior: sin esto pdfkit abriría otra página.
      doc.page.margins.bottom = 0;
      if (!signed) {
        doc.save();
        doc.rotate(-35, { origin: [W / 2, doc.page.height / 2] });
        doc.font('XB').fontSize(64).fillColor(C.amber).fillOpacity(0.07)
          .text('BORRADOR', 0, doc.page.height / 2 - 40, { width: W, align: 'center', lineBreak: false });
        doc.restore();
        doc.fillOpacity(1);
      }
      const fy = doc.page.height - 40;
      doc.moveTo(L, fy - 10).lineTo(L + CW, fy - 10).lineWidth(0.5).strokeColor(C.line).stroke();
      doc.font('R').fontSize(8).fillColor(C.faint);
      doc.text(`Generado con Migo · migopet.app · Expediente ${r.id.slice(0, 8).toUpperCase()}`, L, fy, {
        width: CW - 60, lineBreak: false, height: 10,
      });
      doc.text(`Página ${i - range.start + 1} de ${range.count}`, L + CW - 80, fy, { width: 80, align: 'right', lineBreak: false, height: 10 });
    }

    doc.end();
  });
}
