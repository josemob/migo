import type { ImageSourcePropType } from 'react-native';

// Catálogo de razas de perro con su ilustración (en src/perros).
// Metro exige require() estáticos, por eso el mapa es explícito.
export interface Breed {
  name: string;
  image: ImageSourcePropType;
}

export const BREEDS: Breed[] = [
  { name: 'Beagle', image: require('../perros/beagle.png') },
  { name: 'Bóxer', image: require('../perros/boxer.png') },
  { name: 'Bull Terrier', image: require('../perros/bull-terrier.png') },
  { name: 'Bulldog', image: require('../perros/bulldog.png') },
  { name: 'Bulldog Francés', image: require('../perros/bulldog-frances.png') },
  { name: 'Chihuahua', image: require('../perros/chihuahua.png') },
  { name: 'Cocker Spaniel', image: require('../perros/cocker-spaniel.png') },
  { name: 'Corgi', image: require('../perros/corgi.png') },
  { name: 'Dachshund', image: require('../perros/dachshund.png') },
  { name: 'Dálmata', image: require('../perros/dalmata.png') },
  { name: 'Dóberman', image: require('../perros/doberman.png') },
  { name: 'Golden Retriever', image: require('../perros/golden-retriever.png') },
  { name: 'Husky Siberiano', image: require('../perros/husky-siberiano.png') },
  { name: 'Jack Russell Terrier', image: require('../perros/jack-russell-terrier.png') },
  { name: 'Labrador Retriever', image: require('../perros/labrador-retriever.png') },
  { name: 'Mestizo', image: require('../perros/mestizo.png') },
  { name: 'Mucuchíes', image: require('../perros/mucuchies.png') },
  { name: 'Pastor Alemán', image: require('../perros/pastor-aleman.png') },
  { name: 'Pinscher Miniatura', image: require('../perros/pinscher-miniatura.png') },
  { name: 'Pitbull', image: require('../perros/pitbull.png') },
  { name: 'Pomerania', image: require('../perros/pomerania.png') },
  { name: 'Poodle', image: require('../perros/poodle.png') },
  { name: 'Pug', image: require('../perros/pug.png') },
  { name: 'Rottweiler', image: require('../perros/rottweiler.png') },
  { name: 'Schnauzer', image: require('../perros/schnauzer.png') },
  { name: 'Shih Tzu', image: require('../perros/shih-tzu.png') },
  { name: 'Weimaraner', image: require('../perros/weimaraner.png') },
  { name: 'Yorkshire Terrier', image: require('../perros/yorkshire-terrier.png') },
];

const BY_NAME: Record<string, ImageSourcePropType> = BREEDS.reduce(
  (acc, b) => {
    acc[b.name.toLowerCase()] = b.image;
    return acc;
  },
  {} as Record<string, ImageSourcePropType>,
);

/** Imagen de la raza por nombre (case-insensitive). null si no hay coincidencia. */
export function breedImage(breed?: string | null): ImageSourcePropType | null {
  if (!breed) return null;
  return BY_NAME[breed.trim().toLowerCase()] ?? null;
}
