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

/**
 * Toma una foto con la cámara y la devuelve como data URI (base64).
 * `front: true` usa la cámara frontal (selfie); por defecto usa la trasera (documentos).
 */
export async function capturePhotoAsDataUri(opts?: { front?: boolean; aspect?: [number, number] }): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    appAlert('Permiso de cámara', 'Activa el acceso a la cámara para tomar la foto.');
    return null;
  }
  const res = await ImagePicker.launchCameraAsync({
    cameraType: opts?.front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    allowsEditing: true,
    aspect: opts?.aspect ?? [1, 1],
    quality: 0.4,
    base64: true,
  });
  const asset = res.canceled ? null : res.assets[0];
  if (!asset?.base64) return null;
  return `data:image/jpeg;base64,${asset.base64}`;
}
