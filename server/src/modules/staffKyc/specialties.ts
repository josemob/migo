// Taxonomía estándar de especialidades veterinarias de Migo (lista cerrada + "Otra").
// Se comparte entre el escaneo del carnet (Fase B), el KYC y el ruteo por especialidad
// de emergencias (Fase C). El valor "Otra" habilita texto libre en el cliente.
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

export type VetSpecialty = (typeof VET_SPECIALTIES)[number] | 'Otra';
