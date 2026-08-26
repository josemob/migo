import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { appAlert } from './dialog';

/**
 * Deja elegir un PDF (o imagen) y lo devuelve como data URI base64 + su nombre.
 * null si se cancela. Limita a ~8MB para no reventar el payload.
 */
export async function pickDocumentAsDataUri(): Promise<{ url: string; name: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  if (asset.size && asset.size > 8 * 1024 * 1024) {
    appAlert('Archivo muy grande', 'El documento supera los 8MB. Usa uno más liviano.');
    return null;
  }
  const mime = asset.mimeType ?? (asset.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' as FileSystem.EncodingType });
  return { url: `data:${mime};base64,${base64}`, name: asset.name ?? 'documento' };
}

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
