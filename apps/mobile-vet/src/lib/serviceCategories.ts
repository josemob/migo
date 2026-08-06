// Catálogo de categorías de servicio (coincide con enum ServiceCategory del backend).
// label = etiqueta visible · icon = nombre en TabIcon · title = encabezado del directorio filtrado
export interface ServiceCategoryMeta {
  key: string;
  label: string;
  icon: string;
  title: string;
}

export const SERVICE_CATEGORIES: ServiceCategoryMeta[] = [
  { key: 'CONSULTATION', label: 'Consultas', icon: 'medical', title: 'Consultas médicas' },
  { key: 'GROOMING', label: 'Estética', icon: 'scissors', title: 'Peluquerías cercanas' },
  { key: 'VACCINATION', label: 'Vacunación', icon: 'syringe', title: 'Planes de vacunación' },
  { key: 'DEWORMING', label: 'Desparasitación', icon: 'syringe', title: 'Desparasitación' },
  { key: 'LAB', label: 'Laboratorio', icon: 'file', title: 'Laboratorio clínico' },
  { key: 'IMAGING', label: 'Imagenología', icon: 'file', title: 'Imagenología' },
  { key: 'SURGERY', label: 'Cirugía', icon: 'medical', title: 'Cirugías' },
  { key: 'DENTAL', label: 'Dental', icon: 'medical', title: 'Odontología' },
  { key: 'EMERGENCY', label: 'Urgencias', icon: 'heartPulse', title: 'Urgencias 24/7' },
  { key: 'OTHER', label: 'Otros', icon: 'paw', title: 'Otros servicios' },
];

export const categoryMeta = (key?: string | null): ServiceCategoryMeta | undefined =>
  SERVICE_CATEGORIES.find((c) => c.key === key);

export const categoryLabel = (key?: string | null): string => categoryMeta(key)?.label ?? key ?? '';
