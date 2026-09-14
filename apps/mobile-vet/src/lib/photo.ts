import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import { appAlert } from './dialog';

// Lado máximo de las imágenes que enviamos al backend (payload limitado a 2MB).
// Avatares: 640px sobra. Documentos del KYC (cédula, carnet): 1280px para que
// sigan legibles al verificarlos.
const MAX_AVATAR = 640;
const MAX_DOC = 1280;

/** Redimensiona (si hace falta) y codifica a JPEG base64 como data URI. */
async function toDataUri(asset: ImagePicker.ImagePickerAsset, maxSide: number, quality: number): Promise<string | null> {
  const w = asset.width || maxSide;
  const h = asset.height || maxSide;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const actions = scale < 1 ? [{ resize: { width: Math.round(w * scale), height: Math.round(h * scale) } }] : [];
  const out = await manipulateAsync(asset.uri, actions, { compress: quality, format: SaveFormat.JPEG, base64: true });
  return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
}

/**
 * Deja elegir un PDF (o imagen) y lo devuelve como data URI base64 + su nombre.
 * null si se cancela o falla. Limita a ~8MB para no reventar el payload.
 */
export async function pickDocumentAsDataUri(): Promise<{ url: string; name: string } | null> {
  try {
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
  } catch (e) {
    appAlert('No se pudo cargar el documento', e instanceof Error ? e.message : 'Intenta con otro archivo.');
    return null;
  }
}

/**
 * Abre la galería, recorta a cuadrado, redimensiona y devuelve la imagen como
 * data URI (base64). null si se cancela, no hay permiso o falla. Nunca lanza.
 */
export async function pickPhotoAsDataUri(aspect: [number, number] = [1, 1]): Promise<string | null> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      appAlert('Permiso necesario', 'Activa el acceso a tus fotos para cambiar la imagen.');
      return null;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.8 });
    const asset = res.canceled ? null : res.assets?.[0];
    if (!asset?.uri) return null;
    return await toDataUri(asset, MAX_AVATAR, 0.6);
  } catch (e) {
    appAlert('No se pudo cargar la foto', e instanceof Error ? e.message : 'Intenta con otra imagen.');
    return null;
  }
}

/**
 * Toma una foto con la cámara y la devuelve como data URI (base64), redimensionada.
 * `front: true` usa la cámara frontal (selfie); por defecto usa la trasera (documentos).
 * null si se cancela, no hay permiso o falla. Nunca lanza.
 */
export async function capturePhotoAsDataUri(opts?: { front?: boolean; aspect?: [number, number] }): Promise<string | null> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      appAlert('Permiso de cámara', 'Activa el acceso a la cámara para tomar la foto.');
      return null;
    }
    const res = await ImagePicker.launchCameraAsync({
      cameraType: opts?.front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
      allowsEditing: true,
      aspect: opts?.aspect ?? [1, 1],
      quality: 0.9,
    });
    const asset = res.canceled ? null : res.assets?.[0];
    if (!asset?.uri) return null;
    return await toDataUri(asset, opts?.front ? MAX_AVATAR : MAX_DOC, 0.7);
  } catch (e) {
    appAlert('No se pudo tomar la foto', e instanceof Error ? e.message : 'Intenta de nuevo.');
    return null;
  }
}
