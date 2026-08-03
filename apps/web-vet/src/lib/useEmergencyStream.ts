import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { tokens } from './api';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1';

/**
 * Suscribe el dashboard al stream SSE de urgencias. Al llegar una alerta,
 * invalida las queries relevantes (para refrescar el panel) y dispara `onAlert`
 * (p. ej. la alarma sonora). Reconecta solo si se cae la conexión.
 */
export function useEmergencyStream(onAlert?: () => void) {
  const qc = useQueryClient();
  const cbRef = useRef(onAlert);
  cbRef.current = onAlert;

  useEffect(() => {
    let closed = false;
    let es: EventSource | null = null;
    let reconnect: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const token = tokens.access;
      if (!token) return;
      es = new EventSource(`${BASE}/emergencies/stream?token=${encodeURIComponent(token)}`);

      es.addEventListener('emergency', () => {
        qc.invalidateQueries({ queryKey: ['emg-active'] });
        qc.invalidateQueries({ queryKey: ['emg-recent'] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
        cbRef.current?.();
      });

      es.onerror = () => {
        es?.close();
        if (!closed) reconnect = setTimeout(connect, 5000);
      };
    };

    connect();
    return () => {
      closed = true;
      if (reconnect) clearTimeout(reconnect);
      es?.close();
    };
  }, [qc]);
}
