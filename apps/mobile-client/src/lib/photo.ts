import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import { appAlert } from './dialog';

// Lado máximo de la foto que enviamos al backend. Una foto de 12MP en base64 pesa
// varios MB (memoria en el teléfono + payload que el backend limita a 2MB); a 640px
// queda en ~40-80KB, más que suficiente para un avatar.
const MAX_SIDE = 640;

type Origen = 'camara' | 'galeria';

/** Pregunta de dónde sacar la foto. null si cancela o cierra con "atrás". */
function elegirOrigen(): Promise<Origen | null> {
  return new Promise((resolve) => {
    // DialogHost apila 3+ botones en orden inverso: este arreglo se ve de arriba
    // a abajo como Tomar foto / Elegir de la galería / Cancelar.
    appAlert(
      'Cambiar foto',
      undefined,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
        { text: 'Elegir de la galería', onPress: () => resolve('galeria') },
        { text: 'Tomar foto', onPress: () => resolve('camara') },
      ],
      () => resolve(null),
    );
  });
}

/**
 * Pregunta si tomar la foto con la cámara o elegirla de la galería, recorta a
 * cuadrado, redimensiona y devuelve la imagen como data URI (base64) lista para
 * guardar en el backend. null si se cancela, no hay permiso o falla. Nunca lanza:
 * los errores se muestran con appAlert.
 */
export async function pickPhotoAsDataUri(aspect: [number, number] = [1, 1]): Promise<string | null> {
  try {
    const origen = await elegirOrigen();
    if (!origen) return null;
    // Deja que el diálogo termine de cerrarse antes de abrir la cámara o la
    // galería: en iOS no se puede presentar el selector encima de un modal que
    // todavía se está ocultando, y no avisa, simplemente no abre.
    await new Promise((r) => setTimeout(r, 350));

    // En Android la galería abre el selector de fotos del sistema, que no pide
    // permiso: la app no declara READ_MEDIA_* (Google Play solo los acepta en apps
    // cuya función principal es la galería). Solo iOS necesita pedirlo.
    const perm =
      origen === 'camara'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : Platform.OS === 'android'
          ? { granted: true }
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      appAlert(
        'Permiso necesario',
        origen === 'camara'
          ? 'Activa el acceso a la cámara para tomar la foto.'
          : 'Activa el acceso a tus fotos para cambiar la imagen.',
      );
      return null;
    }

    const opciones: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.8 };
    const res =
      origen === 'camara'
        ? await ImagePicker.launchCameraAsync(opciones)
        : await ImagePicker.launchImageLibraryAsync(opciones);
    const asset = res.canceled ? null : res.assets?.[0];
    if (!asset?.uri) return null;

    const w = asset.width || MAX_SIDE;
    const h = asset.height || MAX_SIDE;
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    const actions = scale < 1 ? [{ resize: { width: Math.round(w * scale), height: Math.round(h * scale) } }] : [];
    const out = await manipulateAsync(asset.uri, actions, { compress: 0.6, format: SaveFormat.JPEG, base64: true });
    if (!out.base64) return null;
    return `data:image/jpeg;base64,${out.base64}`;
  } catch (e) {
    appAlert('No se pudo cargar la foto', e instanceof Error ? e.message : 'Intenta con otra imagen.');
    return null;
  }
}
