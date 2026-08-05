import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Button, Loading, Pill } from '../components/ui';
import { cardShadow, colors, radius, type } from '../theme';

interface CareEvent {
  kind: 'appointment' | 'suggestion';
  id: string;
  title: string;
  date: string; // ISO
  status?: string;
  petId: string;
  petName: string;
  clinicId: string | null;
  clinicName: string | null;
  description?: string;
}

const WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const dayLabel = (d: Date) => `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
const timeLabel = (d: Date) => {
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h.toString().padStart(2, '0')}:${m} ${ampm}`;
};
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export default function CareCalendarScreen({ navigation }: { navigation: any }) {
  const { data, isLoading } = useQuery({
    queryKey: ['care-calendar'],
    queryFn: () => api<{ events: CareEvent[] }>('/me/care-calendar'),
  });

  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });

  const events = data?.events ?? [];

  // Mapa fecha -> tipo de evento para pintar los círculos del calendario
  const marks = useMemo(() => {
    const map: Record<string, { appt: boolean; sug: boolean }> = {};
    for (const e of events) {
      const d = new Date(e.date);
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const cur = map[k] ?? { appt: false, sug: false };
      if (e.kind === 'appointment') cur.appt = true;
      else cur.sug = true;
      map[k] = cur;
    }
    return map;
  }, [events]);

  // Próximas tareas: de hoy en adelante, orden ascendente
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcoming = useMemo(
    () => events.filter((e) => new Date(e.date) >= startToday).sort((a, b) => a.date.localeCompare(b.date)),
    [events],
  );
  const petName = upcoming[0]?.petName ?? events[0]?.petName;

  // Rejilla del mes
  const firstWeekday = new Date(cursor.y, cursor.m, 1).getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  if (isLoading) return <Loading />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerSide} />
        <Text style={styles.headerTitle}>Calendario de Cuidados</Text>
        <Pressable style={styles.headerSide} hitSlop={8} onPress={() => navigation.navigate('Directorio', { category: null })}>
          <Text style={styles.plus}>＋</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 20 }} showsVerticalScrollIndicator={false}>
        {/* Calendario */}
        <View style={styles.card}>
          <View style={styles.monthRow}>
            <Text style={styles.monthTitle}>{MONTHS[cursor.m]} {cursor.y}</Text>
            <View style={styles.navBtns}>
              <Pressable hitSlop={8} onPress={() => shiftMonth(-1)}><Text style={styles.chevron}>‹</Text></Pressable>
              <Pressable hitSlop={8} onPress={() => shiftMonth(1)}><Text style={styles.chevron}>›</Text></Pressable>
            </View>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={styles.weekday}>{w}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((day, i) => {
              if (day === null) return <View key={i} style={styles.cell} />;
              const k = `${cursor.y}-${cursor.m}-${day}`;
              const mk = marks[k];
              const isToday = sameDay(new Date(cursor.y, cursor.m, day), now);
              const filled = mk?.appt ? colors.brand : mk?.sug ? colors.amber : null;
              return (
                <View key={i} style={styles.cell}>
                  <View style={[styles.dayCircle, filled ? { backgroundColor: filled } : isToday && styles.today]}>
                    <Text style={[styles.dayText, filled && styles.dayTextOn, isToday && !filled && styles.todayText]}>{day}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.legendDivider} />
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: colors.brand }]} />
            <Text style={styles.legendText}>Agendado (Cita confirmada)</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: colors.amber }]} />
            <Text style={styles.legendText}>Sugerencia de Migo (Asistente IA)</Text>
          </View>
        </View>

        {/* Próximas tareas */}
        <View style={styles.tasksHead}>
          <Text style={styles.tasksTitle}>Próximas Tareas</Text>
          {petName && <Text style={styles.tasksFor}>para {petName}</Text>}
        </View>

        {upcoming.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🗓️</Text>
            <Text style={styles.emptyText}>No tienes tareas próximas. Cuando agendes una cita o Migo detecte un refuerzo, aparecerá aquí.</Text>
            <Button title="Agendar una cita" size="md" onPress={() => navigation.navigate('Directorio', { category: null })} />
          </View>
        ) : (
          upcoming.map((e) => <TaskCard key={`${e.kind}-${e.id}`} e={e} navigation={navigation} />)
        )}

        <Button title="Ver todo el historial de eventos" variant="outline" onPress={() => navigation.navigate('Expediente')} />
      </ScrollView>
    </SafeAreaView>
  );
}

function TaskCard({ e, navigation }: { e: CareEvent; navigation: any }) {
  const d = new Date(e.date);
  const isAppt = e.kind === 'appointment';
  const accent = isAppt ? colors.brand : colors.amber;

  return (
    <View style={styles.taskCard}>
      <View style={[styles.accentBar, { backgroundColor: accent }]} />
      <View style={styles.taskBody}>
        <View style={styles.taskTopRow}>
          <Text style={styles.taskTitle} numberOfLines={2}>{e.title}</Text>
          {!isAppt && <Badge text="IA" color={colors.amber} />}
        </View>
        <Text style={[styles.taskDate, { color: accent }]}>{dayLabel(d)}</Text>
        {isAppt ? (
          <Text style={styles.taskMeta}>{timeLabel(d)}{e.clinicName ? ` · ${e.clinicName}` : ''}</Text>
        ) : (
          <Text style={styles.taskMeta}>{e.description}</Text>
        )}
        <View style={styles.taskCta}>
          {isAppt ? (
            <Pill
              label="Ver Cita"
              color={colors.brand}
              onPress={() => (e.clinicId ? navigation.navigate('ClinicDetail', { id: e.clinicId, name: e.clinicName }) : null)}
            />
          ) : (
            <Pill
              label="Agendar Ahora"
              color={colors.amber}
              filled
              onPress={() =>
                e.clinicId
                  ? navigation.navigate('ClinicDetail', { id: e.clinicId, name: e.clinicName })
                  : navigation.navigate('Directorio', { category: null })
              }
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EFEAF3' },
  headerSide: { width: 36, alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.brand },
  plus: { fontSize: 24, color: colors.brand, fontWeight: '400' },

  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18, boxShadow: cardShadow },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  monthTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  navBtns: { flexDirection: 'row', gap: 18 },
  chevron: { fontSize: 24, color: colors.muted, fontWeight: '700', lineHeight: 24 },

  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700', color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1.5, borderColor: colors.brand },
  dayText: { fontSize: 15, fontWeight: '600', color: colors.text },
  dayTextOn: { color: colors.white, fontWeight: '800' },
  todayText: { color: colors.brand, fontWeight: '800' },

  legendDivider: { height: 1, backgroundColor: colors.border, marginTop: 14, marginBottom: 12 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 14, color: colors.text },

  tasksHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  tasksTitle: { fontSize: 22, fontWeight: '900', color: colors.text },
  tasksFor: { fontSize: 15, fontWeight: '700', color: colors.brand },

  taskCard: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden', boxShadow: cardShadow },
  accentBar: { width: 6 },
  taskBody: { flex: 1, padding: 16, gap: 4 },
  taskTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  taskTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  taskDate: { ...type.h4, marginTop: 2 },
  taskMeta: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  taskCta: { alignItems: 'flex-end', marginTop: 10 },

  empty: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 24, alignItems: 'center', gap: 12, boxShadow: cardShadow },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
});
