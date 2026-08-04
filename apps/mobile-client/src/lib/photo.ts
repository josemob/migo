import * as ImagePicker from 'expo-image-picker';
import { appAlert } from './dialog';

/**
 * Abre la galería, recorta a cuadrado y devuelve la imagen como data URI
 * (base64) lista para guardar en el backend. null si se cancela o no hay permiso.
 */
export async function pickPhotoAsDataUri(aspect: [number, number] = [1, 1]): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    appAlert('Permiso necesario', 'Activa el acceso a tus fotos para cambiar la imagen.');
    return null;
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect,
    quality: 0.4,
    base64: true,
  });
  const asset = res.canceled ? null : res.assets[0];
  if (!asset?.base64) return null;
  return `data:image/jpeg;base64,${asset.base64}`;
}
