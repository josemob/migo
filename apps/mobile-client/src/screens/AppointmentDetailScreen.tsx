import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { BackButton } from '../components/BackButton';
import { Badge, Button } from '../components/ui';
import { cardShadow, colors, radius } from '../theme';

interface AppointmentDetail {
  id: string;
  scheduledAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  reason?: string | null;
  priceUsd?: string | number | null;
  paidInApp: boolean;
  cancelReason?: string | null;
  clinic: { id: string; name: string; phone?: string | null; address?: string | null };
  service?: { name: string; category?: string } | null;
  pet: { id: string; name: string };
  vet?: { user: { fullName: string } } | null;
}

const STATUS: Record<AppointmentDetail['status'], { label: string; color: string }> = {
  PENDING: { label: 'Por confirmar', color: colors.amber },
  CONFIRMED: { label: 'Confirmada', color: colors.green },
  IN_PROGRESS: { label: 'En atención', color: colors.brand },
  COMPLETED: { label: 'Completada', color: colors.muted },
  CANCELLED: { label: 'Cancelada', color: colors.red },
  NO_SHOW: { label: 'No asistió', color: colors.muted },
};

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' });
// "lunes, 2 de noviembre" -> "Lunes, 2 de noviembre" (textTransform capitalize ponía "De Noviembre")
const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true });

// Detalle de una cita del dueño ("Ver Cita" en el calendario). Antes "Ver Cita" abría la
// página de la clínica y el dueño no tenía cómo cancelar.
export default function AppointmentDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const { id } = route.params ?? {};
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['appointment', id],
    queryFn: () => api<{ appointment: AppointmentDetail }>(`/me/appointments/${id}`),
    select: (r) => r.appointment,
  });

  const cancel = useMutation({
    mutationFn: () => api(`/me/appointments/${id}/cancel`, { method: 'POST', body: {} }),
    onSuccess: () => {
      for (const k of ['appointment', 'care-calendar', 'next-appointment', 'appointments']) qc.invalidateQueries({ queryKey: [k] });
      appAlert('Cita cancelada', 'Le avisamos a la clínica.', [{ text: 'Listo', onPress: () => navigation.goBack() }]);
    },
    onError: (e) => appAlert('No se pudo cancelar', e instanceof Error ? e.message : 'Intenta de nuevo.'),
  });

  const confirmCancel = () => {
    if (!data) return;
    appAlert(
      '¿Cancelar esta cita?',
      `${data.service?.name ?? data.reason ?? 'Cita'} · ${longDate(data.scheduledAt)}, ${timeLabel(data.scheduledAt)}` +
        (data.paidInApp ? '\n\nLa pagaste en la app: la clínica se comunicará contigo para el reembolso.' : ''),
      [
        { text: 'No, mantener', style: 'cancel' },
        { text: 'Sí, cancelar', style: 'destructive', onPress: () => cancel.mutate() },
      ],
    );
  };

  const canCancel = data && (data.status === 'PENDING' || data.status === 'CONFIRMED');
  const st = data ? STATUS[data.status] ?? STATUS.PENDING : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>Tu cita</Text>
        <View style={{ width: 44 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : isError || !data ? (
        <View style={{ paddingHorizontal: 16, paddingVertical: 20, gap: 12 }}>
          <Text style={{ fontSize: 15, color: colors.muted }}>No pudimos cargar la cita. Revisa tu conexión e intenta de nuevo.</Text>
          <Pressable onPress={() => void refetch()}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.brand }}>Reintentar →</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: insets.bottom + 34, gap: 12 }} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.topRow}>
              <Text style={styles.title}>{data.service?.name ?? data.reason ?? 'Cita veterinaria'}</Text>
              {st && <Badge text={st.label} color={st.color} />}
            </View>
            <Text style={styles.when}>{capFirst(longDate(data.scheduledAt))}</Text>
            <Text style={styles.time}>{timeLabel(data.scheduledAt)}</Text>
          </View>

          <View style={styles.card}>
            <Row label="Mascota" value={data.pet.name} />
            <Row label="Clínica" value={data.clinic.name} />
            {data.clinic.address ? <Row label="Dirección" value={data.clinic.address} /> : null}
            {data.vet?.user.fullName ? <Row label="Veterinario" value={data.vet.user.fullName} /> : null}
            {data.priceUsd != null ? (
              <Row label="Precio" value={`$${Number(data.priceUsd).toFixed(2)}${data.paidInApp ? ' · pagado en la app' : ''}`} />
            ) : null}
            {data.status === 'CANCELLED' && data.cancelReason ? <Row label="Motivo" value={data.cancelReason} /> : null}
          </View>

          <Button
            title="Ver la clínica"
            variant="outline"
            onPress={() => navigation.navigate('ClinicDetail', { id: data.clinic.id, name: data.clinic.name })}
          />
          {data.clinic.phone ? (
            <Button title="Llamar a la clínica" variant="outline" onPress={() => Linking.openURL(`tel:${data.clinic.phone}`).catch(() => {})} />
          ) : null}
          {canCancel ? (
            <Button title="Cancelar cita" variant="dangerOutline" loading={cancel.isPending} onPress={confirmCancel} />
          ) : null}
          {canCancel ? (
            <Text style={styles.hint}>¿Quieres otro horario? Cancela esta cita y agenda una nueva desde la clínica.</Text>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
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
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, boxShadow: cardShadow },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 18, fontWeight: '900', color: colors.text },
  when: { fontSize: 15, fontWeight: '700', color: colors.brand, marginTop: 8 },
  time: { fontSize: 14, color: colors.muted, marginTop: 2 },
  row: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0ECF3' },
  rowLabel: { fontSize: 12, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  rowValue: { fontSize: 15, color: colors.text, marginTop: 2 },
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 18 },
});
