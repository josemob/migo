// Taxonomía estándar de especialidades (espejo de la del backend). Lista cerrada + "Otra"
// (habilita texto libre). Se usa en el KYC y en el perfil del vet independiente.
export const VET_SPECIALTIES = [
  'Medicina general',
  'Cirugía',
  'Medicina interna',
  'Dermatología',
  'Cardiología',
  'Oftalmología',
  'Odontología',
  'Traumatología y ortopedia',
  'Animales exóticos',
  'Etología (comportamiento)',
  'Oncología',
  'Neurología',
  'Nutrición',
  'Reproducción',
  'Emergencias y cuidados intensivos',
  'Imagenología (radiología/ecografía)',
  'Anestesiología',
  'Medicina felina',
  'Grandes animales / equinos',
] as const;

export const OTHER_SPECIALTY = 'Otra';

/** ¿El valor guardado corresponde a una especialidad de la lista cerrada? */
export function isKnownSpecialty(value?: string | null): boolean {
  return !!value && (VET_SPECIALTIES as readonly string[]).includes(value);
}
