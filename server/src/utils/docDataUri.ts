import { z } from 'zod';

/**
 * Documento subido como data URI (imagen comprimida en el navegador o PDF), ~650 KB máx.
 * Se guarda tal cual en la BD, igual que los documentos del KYC del personal.
 */
export const docDataUri = z
  .string()
  .max(900_000, 'El archivo es muy pesado (máx. ~650 KB). Sube una foto o un PDF más liviano.')
  .regex(/^data:(image\/(jpeg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/, 'Formato no válido: sube una imagen (JPG/PNG) o un PDF');
