import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { cardShadow, colors, radius } from '../theme';

// Ventana emergente "¡Tu cita fue aceptada!" con el resumen de la cita.
// Sale cuando la clínica acepta una solicitud: al instante si la app está abierta (push en
// primer plano) o la próxima vez que el dueño la abre/vuelve a ella. Cada cita se muestra
// una sola vez (ids vistos en AsyncStorage).

const SEEN_KEY = 'migo_accepted_seen';

interface ListAppt { id: string; status: string; scheduledAt: string }
interface Detail {
  id: string;
  scheduledAt: string;
  reason?: string | null;
  priceUsd?: string | number | null;
  clinic: { name: string; address?: string | null };
  service?: { name: string } | null;
  pet: { name: string };
  vet?: { user: { fullName: string } } | null;
}

async function readSeen(): Promise<Set<string> | null> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return new Set();
  }
}
async function writeSeen(ids: Set<string>) {
  try {
    // Solo los últimos 200: no hace falta recordar citas viejas para siempre.
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    /* sin almacenamiento: a lo sumo se repite el aviso */
  }
}

const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dateLabel = (iso: string) =>
  capFirst(new Date(iso).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' }));
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });

export function AppointmentAcceptedModal({ onOpen }: { onOpen: (appointmentId: string) => void }) {
  const qc = useQueryClient();
  const [appt, setAppt] = useState<Detail | null>(null);
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const { data } = await api<{ data: ListAppt[] }>('/me/appointments');
      const accepted = data.filter(
        (a) => a.status === 'CONFIRMED' && new Date(a.scheduledAt).getTime() > Date.now() - 3600_000,
      );
      const seen = await readSeen();
      // Primera vez con esta versión: las citas ya confirmadas cuentan como vistas (sin avalancha de avisos).
      if (seen === null) {
        await writeSeen(new Set(accepted.map((a) => a.id)));
        return;
      }
      const next = accepted.find((a) => !seen.has(a.id));
      if (!next) return;
      const { appointment } = await api<{ appointment: Detail }>(`/me/appointments/${next.id}`);
      setAppt(appointment);
    } catch {
      /* sin red: se reintenta al volver a la app */
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    void check();
    // Al volver a la app (p. ej. desde la notificación o tras dejarla en segundo plano).
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check();
    });
    // Push recibida con la app abierta: la clínica acaba de aceptar → mostrar ya.
    let notifSub: { remove: () => void } | null = null;
    try {
      notifSub = Notifications.addNotificationReceivedListener((n) => {
        const d = n.request.content.data as { type?: string; status?: string } | undefined;
        if (d?.type === 'appointment') {
          for (const k of ['appointment', 'care-calendar', 'next-appointment', 'appointments']) void qc.invalidateQueries({ queryKey: [k] });
          if (d.status === 'CONFIRMED') void check();
        }
      });
    } catch {
      /* notificaciones no disponibles en este entorno */
    }
    return () => {
      appSub.remove();
      notifSub?.remove();
    };
  }, [check, qc]);

  const close = async (open: boolean) => {
    if (!appt) return;
    const id = appt.id;
    const seen = (await readSeen()) ?? new Set<string>();
    seen.add(id);
    await writeSeen(seen);
    setAppt(null);
    if (open) onOpen(id);
    // Puede haber otra aceptada en cola.
    setTimeout(() => void check(), 400);
  };

  if (!appt) return null;
  const service = appt.service?.name ?? appt.reason ?? 'Cita veterinaria';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => void close(false)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.badge}><Text style={styles.badgeTxt}>✓</Text></View>
          <Text style={styles.title}>¡Tu cita fue aceptada!</Text>
          <Text style={styles.sub}>{appt.clinic.name} confirmó tu solicitud. Te esperamos.</Text>

          <View style={styles.summary}>
            <Row label="Fecha" value={dateLabel(appt.scheduledAt)} />
            <Row label="Hora" value={timeLabel(appt.scheduledAt)} />
            <Row label="Mascota" value={appt.pet.name} />
            <Row label="Servicio" value={service} />
            {appt.priceUsd != null ? <Row label="Precio" value={`$${Number(appt.priceUsd).toFixed(2)}`} /> : null}
            {appt.vet?.user.fullName ? <Row label="Te atiende" value={appt.vet.user.fullName} /> : null}
            <Row label="Clínica" value={appt.clinic.name} />
            {appt.clinic.address ? <Row label="Dirección" value={appt.clinic.address} /> : null}
          </View>

          <Pressable style={styles.primary} onPress={() => void close(true)}>
            <Text style={styles.primaryTxt}>Ver mi cita</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => void close(false)} hitSlop={8}>
            <Text style={styles.secondaryTxt}>Cerrar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20, 10, 30, 0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.white, borderRadius: radius.xl, padding: 20, alignItems: 'center', boxShadow: cardShadow },
  badge: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  badgeTxt: { color: colors.white, fontSize: 28, fontWeight: '900' },
  title: { fontSize: 20, fontWeight: '900', color: colors.text, textAlign: 'center' },
  sub: { fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: 4 },
  summary: { alignSelf: 'stretch', backgroundColor: colors.brandLight, borderRadius: radius.lg, padding: 14, marginTop: 16, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 13, color: colors.muted },
  rowValue: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text, textAlign: 'right' },
  primary: { alignSelf: 'stretch', backgroundColor: colors.brand, borderRadius: 16, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  primaryTxt: { color: colors.white, fontWeight: '800', fontSize: 16 },
  secondary: { paddingVertical: 12 },
  secondaryTxt: { color: colors.brand, fontWeight: '700', fontSize: 15 },
});
