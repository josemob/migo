import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { cardShadow, colors, radius, type } from '../theme';

// Citas por atender del vet (Inicio y Agenda). El servidor filtra con mine=1: las asignadas
// a este vet + las que aún no tienen vet. Se traen también las de los últimos 30 días que
// quedaron sin concluir, para mostrarlas como "Atrasada" en vez de que desaparezcan.

export interface Appt {
  id: string;
  scheduledAt: string;
  status: string;
  reason?: string | null;
  pet: { id: string; name: string; species?: string; owner?: { fullName: string } | null };
  service?: { name: string } | null;
}

// Solo las ya aceptadas: las solicitudes (PENDING) van aparte, en "Solicitudes por aceptar".
const OPEN = 'CONFIRMED,IN_PROGRESS';
export const UPCOMING_KEY = ['vet-appts-upcoming'];

export function useUpcomingAppts() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: UPCOMING_KEY,
    queryFn: () => {
      const from = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
      return api<{ data: Appt[] }>(`/appointments?mine=1&status=${OPEN}&from=${from}`);
    },
    refetchInterval: 30000,
  });
  // Marcar una cita como concluida -> habilita la calificación del servicio en la app del dueño
  const complete = useMutation({
    mutationFn: (id: string) => api(`/appointments/${id}/status`, { method: 'POST', body: { status: 'COMPLETED' } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: UPCOMING_KEY }),
    onError: (e) => appAlert('No se pudo concluir', e instanceof Error ? e.message : 'Intenta de nuevo'),
  });
  const confirmComplete = (a: Appt) =>
    appAlert('Concluir cita', `¿Marcar como concluida la cita de ${a.pet.name}? El dueño podrá calificar el servicio.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Concluir', onPress: () => complete.mutate(a.id) },
    ]);
  const list = (query.data?.data ?? []).slice().sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return { query, list, confirmComplete, completing: complete.isPending };
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const isOverdue = (a: Appt) => new Date(a.scheduledAt) < startOfDay(new Date());

function dayLabel(iso: string): string {
  const d = startOfDay(new Date(iso));
  const today = startOfDay(new Date());
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  const s = d.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'short' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Agrupa: primero "Atrasadas" (días anteriores sin concluir), luego un grupo por día. */
export function groupByDay(list: Appt[]): { title: string; overdue: boolean; items: Appt[] }[] {
  const groups: { title: string; overdue: boolean; items: Appt[] }[] = [];
  const overdue = list.filter(isOverdue);
  if (overdue.length) groups.push({ title: 'Atrasadas', overdue: true, items: overdue });
  for (const a of list.filter((x) => !isOverdue(x))) {
    const title = dayLabel(a.scheduledAt);
    const g = groups[groups.length - 1];
    if (g && !g.overdue && g.title === title) g.items.push(a);
    else groups.push({ title, overdue: false, items: [a] });
  }
  return groups;
}

const timeLabel = (iso: string) => {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h.toString().padStart(2, '0')}:${m} ${ap}`;
};
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  CONFIRMED: { label: 'Confirmada', bg: colors.brand, fg: colors.white },
  PENDING: { label: 'Pendiente', bg: '#FDEEC8', fg: colors.amber },
  IN_PROGRESS: { label: 'En sala', bg: '#E7CFF1', fg: colors.brand },
  COMPLETED: { label: 'Completada', bg: '#DFF3E6', fg: colors.green },
};

export function DayHeader({ title, overdue }: { title: string; overdue?: boolean }) {
  return <Text style={[s.day, overdue && { color: colors.amber }]}>{overdue ? `⚠ ${title}` : title}</Text>;
}

export function ApptCard({ a, onOpen, onComplete, disabled }: { a: Appt; onOpen: () => void; onComplete: () => void; disabled?: boolean }) {
  const late = isOverdue(a);
  const st = late ? { label: 'Atrasada', bg: '#FDEEC8', fg: colors.amber } : STATUS[a.status] ?? STATUS.PENDING;
  return (
    <Pressable style={[s.card, late && { borderLeftColor: colors.amber }]} onPress={onOpen}>
      <View style={s.row}>
        <View style={s.left}>
          <Text style={s.time} numberOfLines={1}>
            ⏰ {late ? `${shortDate(a.scheduledAt)} · ` : ''}{timeLabel(a.scheduledAt)} - {a.service?.name ?? a.reason ?? 'Consulta'}
          </Text>
          <Text style={s.owner}>Dueño: {a.pet.owner?.fullName ?? '—'}</Text>
        </View>
        <View style={s.right}>
          <View style={s.petPill}><Text style={s.petPillTxt}>Paciente: {a.pet.name}</Text></View>
          <View style={[s.badge, { backgroundColor: st.bg }]}><Text style={[s.badgeTxt, { color: st.fg }]}>{st.label}</Text></View>
        </View>
      </View>
      <Pressable style={s.conclude} onPress={onComplete} disabled={disabled}>
        <Text style={s.concludeTxt}>✓ Marcar concluida</Text>
      </Pressable>
    </Pressable>
  );
}

const s = StyleSheet.create({
  day: { fontSize: 14, fontWeight: '800', color: colors.muted, marginTop: 6, marginBottom: 8 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, marginBottom: 12, boxShadow: cardShadow, borderLeftWidth: 4, borderLeftColor: colors.brand },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  left: { flex: 1 },
  time: { fontSize: 15, fontWeight: '800', color: colors.text },
  owner: { fontSize: 14, color: colors.muted, marginTop: 6 },
  right: { alignItems: 'flex-end', gap: 6 },
  petPill: { backgroundColor: colors.brandLight, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5 },
  petPillTxt: { color: colors.brand, fontWeight: '700', fontSize: 12 },
  badge: { borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  badgeTxt: { ...type.bodySmall, fontWeight: '700' },
  conclude: { marginTop: 12, borderWidth: 1.5, borderColor: colors.green, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  concludeTxt: { color: colors.green, fontWeight: '800', fontSize: 14 },
});
