import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

// Bandeja de la campana: el servidor guarda cada push que envía Migo (salvo los de chat).

export const UNREAD_KEY = ['notif-unread'];
export const NOTIFS_KEY = ['notifications'];

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type?: string | null;
  data?: Record<string, unknown> | null;
  readAt?: string | null;
  createdAt: string;
}

/** Contador de no leídas (globo rojo). Se refresca al llegar un push, al volver a la app y cada minuto. */
export function useUnreadCount() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: () => api<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 60000,
    select: (r) => r.count,
  });
  useEffect(() => {
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: UNREAD_KEY });
      void qc.invalidateQueries({ queryKey: NOTIFS_KEY });
    };
    const appSub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    let recv: { remove: () => void } | null = null;
    try {
      recv = Notifications.addNotificationReceivedListener(refresh);
    } catch {
      /* sin notificaciones en este entorno */
    }
    return () => { appSub.remove(); recv?.remove(); };
  }, [qc]);
  return q.data ?? 0;
}

/** A dónde lleva tocar un aviso (mismo destino que tocar el push). null = no abre nada. */
export function notificationTarget(n: { type?: string | null; data?: Record<string, unknown> | null }): { screen: string; params?: object } | null {
  switch (n.type) {
    case 'emergency':
      return { screen: 'Tabs', params: { screen: 'Alerta' } };
    case 'appointment-request':
      return { screen: 'Tabs', params: { screen: 'Home' } }; // "Solicitudes por aceptar"
    case 'appointment':
      return { screen: 'Agenda' }; // p. ej. el dueño canceló una cita
    default:
      return null;
  }
}

export const markRead = (id: string) => api(`/notifications/${id}/read`, { method: 'POST', body: {} });
export const markAllRead = () => api('/notifications/read-all', { method: 'POST', body: {} });
