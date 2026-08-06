import { useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useAuth } from './auth';

// Client IDs de Google OAuth (App VET). El backend acepta cualquiera de los 3
// como `aud` válido del ID token, así que basta con enviar el que Google devuelva.
const GOOGLE_WEB_CLIENT_ID = '967962081340-023koe87cn4vadbf771oe533hg62r5ug.apps.googleusercontent.com';
const GOOGLE_ANDROID_CLIENT_ID = '967962081340-hooajjob19cpg446e60enmqn0hr0b9ta.apps.googleusercontent.com';

// Necesario para cerrar la ventana del navegador al volver del login.
WebBrowser.maybeCompleteAuthSession();

/**
 * Hook de "Continuar con Google" (staff).
 * Abre el flujo de Google, obtiene el ID token y lo canjea en /auth/google.
 * El usuario cae en el StaffGate → KYC como cualquier registro nuevo.
 */
export function useGoogleSignIn(onError?: (msg: string) => void) {
  const { loginWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
  });

  useEffect(() => {
    if (!response) return;
    if (response.type === 'success') {
      const idToken =
        response.authentication?.idToken ??
        (response.params as { id_token?: string } | undefined)?.id_token;
      if (!idToken) {
        setBusy(false);
        onError?.('Google no devolvió un token de identidad.');
        return;
      }
      loginWithGoogle(idToken)
        .catch((e) => onError?.(e instanceof Error ? e.message : 'No se pudo iniciar con Google'))
        .finally(() => setBusy(false));
    } else {
      setBusy(false);
    }
  }, [response]);

  const signIn = async () => {
    setBusy(true);
    try {
      await promptAsync();
    } catch {
      setBusy(false);
      onError?.('No se pudo abrir el inicio de sesión de Google.');
    }
  };

  return { signIn, googleBusy: busy, googleReady: !!request };
}
