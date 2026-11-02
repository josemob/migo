import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Alto del teclado en Android (0 en iOS, donde las hojas usan KeyboardAvoidingView).
 * Para hojas dentro de un <Modal>: con edge-to-edge la ventana del Modal no se achica
 * con el teclado, y KeyboardAvoidingView behavior="height" entraba en un ciclo (la hoja
 * brincaba sin parar). Con un padding fijo igual al alto del teclado no hay ciclo.
 */
export function useAndroidKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}
