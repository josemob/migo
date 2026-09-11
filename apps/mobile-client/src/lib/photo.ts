import * as ImagePicker from 'expo-image-picker';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import { appAlert } from './dialog';

// Lado máximo de la foto que enviamos al backend. Una foto de 12MP en base64 pesa
// varios MB (memoria en el teléfono + payload que el backend limita a 2MB); a 640px
// queda en ~40-80KB, más que suficiente para un avatar.
const MAX_SIDE = 640;

/**
 * Abre la galería, recorta a cuadrado, redimensiona y devuelve la imagen como
 * data URI (base64) lista para guardar en el backend. null si se cancela, no hay
 * permiso o falla. Nunca lanza: los errores se muestran con appAlert.
 */
export async function pickPhotoAsDataUri(aspect: [number, number] = [1, 1]): Promise<string | null> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      appAlert('Permiso necesario', 'Activa el acceso a tus fotos para cambiar la imagen.');
      return null;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect,
      quality: 0.8,
    });
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
