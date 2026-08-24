import { useState } from 'react';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useAuth } from './auth';

// Web OAuth Client ID (Migo Web). El módulo nativo lo usa para obtener el idToken;
// el OAuth client Android (package + SHA-1, ya configurados en Google Cloud) valida
// la firma de la app automáticamente. Sin navegador -> sin el bloqueo de expo-auth-session.
const GOOGLE_WEB_CLIENT_ID = '967962081340-023koe87cn4vadbf771oe533hg62r5ug.apps.googleusercontent.com';

GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });

/** Hook de "Continuar con Google" (Google Sign-In nativo). */
export function useGoogleSignIn(onError?: (msg: string) => void) {
  const { loginWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const res = await GoogleSignin.signIn();
      // v13+: { type, data: { idToken } }; versiones previas: { idToken } directo.
      const r = res as unknown as { type?: string; data?: { idToken?: string }; idToken?: string };
      if (r.type === 'cancelled') return;
      const idToken = r.data?.idToken ?? r.idToken;
      if (!idToken) {
        onError?.('Google no devolvió un token de identidad.');
        return;
      }
      await loginWithGoogle(idToken);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS) return;
      onError?.(e instanceof Error ? e.message : 'No se pudo iniciar con Google.');
    } finally {
      setBusy(false);
    }
  };

  return { signIn, googleBusy: busy, googleReady: true };
}
