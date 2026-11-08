import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { UPCOMING_KEY, type Appt } from './Appointments';
import { cardShadow, colors, radius } from '../theme';

// Solicitudes de cita (PENDING) de TODA la clínica: el dueño eligió día y hora en la app y
// cualquier miembro del equipo puede aceptarlas o rechazarlas. Al aceptar, el servidor asigna
// la cita a quien aceptó y le avisa al dueño (push + ventana en la app + correo).

export const REQUESTS_KEY = ['vet-appt-requests'];

interface RequestAppt extends Appt {
  priceUsd?: string | number | null;
}

export function useAppointmentRequests() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: REQUESTS_KEY,
    // Desde hace 1 h: las que ya pasaron sin respuesta las cancela el servidor solo.
    queryFn: () => api<{ data: RequestAppt[] }>(`/appointments?status=PENDING&from=${new Date(Date.now() - 3600_000).toISOString()}`),
    refetchInterval: 30000,
  });
  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: REQUESTS_KEY });
    void qc.invalidateQueries({ queryKey: UPCOMING_KEY });
  };
  const decide = useMutation({
    mutationFn: (v: { id: string; status: 'CONFIRMED' | 'CANCELLED'; cancelReason?: string }) =>
      api(`/appointments/${v.id}/status`, { method: 'POST', body: { status: v.status, cancelReason: v.cancelReason } }),
    onSuccess: (_r, v) => {
      refreshAll();
      appAlert(
        v.status === 'CONFIRMED' ? 'Cita aceptada ✅' : 'Solicitud rechazada',
        v.status === 'CONFIRMED'
          ? 'Quedó en tu agenda. Le avisamos al dueño con el resumen de la cita.'
          : 'Le avisamos al dueño con el motivo para que elija otro horario.',
      );
    },
    onError: (e) => {
      refreshAll(); // p. ej. otro miembro del equipo ya la aceptó: se actualiza la lista
      appAlert('No se pudo completar', e instanceof Error ? e.message : 'Intenta de nuevo.');
    },
  });
  const list = (query.data?.data ?? []).slice().sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return { query, list, decide };
}

const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const whenLabel = (iso: string) => {
  const d = new Date(iso);
  const day = capFirst(d.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' }));
  const time = d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${day} · ${time}`;
};

const QUICK_REASONS = ['Ese horario ya no está disponible', 'No tenemos ese servicio ese día', 'La agenda de ese día está llena'];

/** Sección "Solicitudes por aceptar" del Inicio. No ocupa espacio si no hay solicitudes. */
export function AppointmentRequestsSection({ onOpenPet }: { onOpenPet: (a: Appt) => void }) {
  const { list, decide } = useAppointmentRequests();
  const [rejecting, setRejecting] = useState<RequestAppt | null>(null);

  if (!list.length) return null;

  const accept = (a: RequestAppt) =>
    appAlert('Aceptar cita', `¿Aceptar la cita de ${a.pet.name} el ${whenLabel(a.scheduledAt)}? Quedará asignada a ti.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Aceptar', onPress: () => decide.mutate({ id: a.id, status: 'CONFIRMED' }) },
    ]);

  return (
    <View>
      <Text style={s.title}>Solicitudes por aceptar ({list.length})</Text>
      {list.map((a) => (
        <Pressable key={a.id} style={s.card} onPress={() => onOpenPet(a)}>
          <Text style={s.when}>🗓️ {whenLabel(a.scheduledAt)}</Text>
          <Text style={s.service} numberOfLines={2}>{a.service?.name ?? a.reason ?? 'Consulta'}</Text>
          <Text style={s.meta}>
            Paciente: <Text style={s.metaBold}>{a.pet.name}</Text>  ·  Dueño: <Text style={s.metaBold}>{a.pet.owner?.fullName ?? '—'}</Text>
          </Text>
          {a.priceUsd != null ? <Text style={s.meta}>Precio: ${Number(a.priceUsd).toFixed(2)}</Text> : null}
          <View style={s.actions}>
            <Pressable style={[s.btn, s.reject]} disabled={decide.isPending} onPress={() => setRejecting(a)}>
              <Text style={s.rejectTxt}>Rechazar</Text>
            </Pressable>
            <Pressable style={[s.btn, s.accept, decide.isPending && { opacity: 0.6 }]} disabled={decide.isPending} onPress={() => accept(a)}>
              <Text style={s.acceptTxt}>✓ Aceptar</Text>
            </Pressable>
          </View>
        </Pressable>
      ))}
      <RejectModal
        appt={rejecting}
        onClose={() => setRejecting(null)}
        onSubmit={(reason) => {
          if (!rejecting) return;
          decide.mutate({ id: rejecting.id, status: 'CANCELLED', cancelReason: reason });
          setRejecting(null);
        }}
      />
    </View>
  );
}

/** Alto del teclado en Android (en un Modal, behavior="height" oscila). */
function useAndroidKeyboardHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setH(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return h;
}

function RejectModal({ appt, onClose, onSubmit }: { appt: RequestAppt | null; onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const kb = useAndroidKeyboardHeight();
  useEffect(() => { if (appt) setReason(''); }, [appt]);
  const ok = reason.trim().length >= 3;
  return (
    <Modal visible={!!appt} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[s.backdrop, { paddingBottom: kb }]} onPress={onClose}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>Rechazar solicitud</Text>
            {appt ? <Text style={s.sheetSub}>{appt.pet.name} · {whenLabel(appt.scheduledAt)}</Text> : null}
            <Text style={s.label}>Motivo (lo verá el dueño)</Text>
            <View style={s.chips}>
              {QUICK_REASONS.map((r) => (
                <Pressable key={r} style={[s.chip, reason === r && s.chipOn]} onPress={() => setReason(r)}>
                  <Text style={[s.chipTxt, reason === r && s.chipTxtOn]}>{r}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={s.input}
              value={reason}
              onChangeText={setReason}
              placeholder="O escribe otro motivo…"
              placeholderTextColor={colors.muted}
              multiline
              maxLength={200}
            />
            <Pressable style={[s.submit, !ok && { opacity: 0.4 }]} disabled={!ok} onPress={() => onSubmit(reason.trim())}>
              <Text style={s.submitTxt}>Rechazar y avisar al dueño</Text>
            </Pressable>
            <Pressable style={s.cancel} onPress={onClose} hitSlop={8}>
              <Text style={s.cancelTxt}>Volver</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 12 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, marginBottom: 12, boxShadow: cardShadow, borderLeftWidth: 4, borderLeftColor: colors.amber },
  when: { fontSize: 15, fontWeight: '800', color: colors.text },
  service: { fontSize: 15, fontWeight: '700', color: colors.brand, marginTop: 4 },
  meta: { fontSize: 14, color: colors.muted, marginTop: 6 },
  metaBold: { color: colors.text, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center' },
  reject: { borderWidth: 1.5, borderColor: colors.red },
  rejectTxt: { color: colors.red, fontWeight: '800', fontSize: 14 },
  accept: { backgroundColor: colors.green },
  acceptTxt: { color: colors.white, fontWeight: '800', fontSize: 14 },

  backdrop: { flex: 1, backgroundColor: 'rgba(20, 10, 30, 0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 28 },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
  sheetSub: { fontSize: 14, color: colors.muted, marginTop: 4 },
  label: { fontSize: 13, fontWeight: '800', color: colors.muted, marginTop: 16, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  chipTxt: { fontSize: 13, color: colors.text, fontWeight: '600' },
  chipTxtOn: { color: colors.brand },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, minHeight: 70, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12, fontSize: 15, color: colors.text, textAlignVertical: 'top' },
  submit: { backgroundColor: colors.red, borderRadius: 16, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  submitTxt: { color: colors.white, fontWeight: '800', fontSize: 16 },
  cancel: { alignItems: 'center', paddingVertical: 12 },
  cancelTxt: { color: colors.brand, fontWeight: '700', fontSize: 15 },
});
