import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { Loading, Muted } from '../components/ui';
import { SlotIcon } from '../components/SlotIcon';
import { cardShadow, colors, radius } from '../theme';

interface Pet { id: string; name: string; species: string; photoUrl?: string }
interface Service { id: string; name: string; category: string; priceUsd: string | number; durationMin: number }

const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Horarios de muestra (el 01:00 PM aparece ocupado)
const SLOTS = [
  { label: '09:00 AM', h: 9, m: 0, off: false },
  { label: '10:00 AM', h: 10, m: 0, off: false },
  { label: '11:30 AM', h: 11, m: 30, off: false },
  { label: '01:00 PM', h: 13, m: 0, off: true },
  { label: '03:00 PM', h: 15, m: 0, off: false },
  { label: '04:30 PM', h: 16, m: 30, off: false },
];

export default function BookAppointmentScreen({ navigation, route }: any) {
  const { clinicId, clinicName, service } = route.params as {
    clinicId: string; clinicName: string; service: Service;
  };
  const price = Number(service.priceUsd);
  const insets = useSafeAreaInsets();

  const pets = useQuery({ queryKey: ['pets'], queryFn: () => api<{ data: Pet[] }>('/me/pets') });
  const [petId, setPetId] = useState<string | null>(null);
  const [dayIdx, setDayIdx] = useState(0);
  const [slotIdx, setSlotIdx] = useState<number | null>(null);
  const [booking, setBooking] = useState(false);

  const petList = pets.data?.data ?? [];
  useEffect(() => {
    if (petList.length && !petId) setPetId(petList[0]!.id);
  }, [petList, petId]);

  // Próximos 6 días desde hoy
  const days = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
  }, []);

  if (pets.isLoading) return <Loading />;

  const pet = petList.find((p) => p.id === petId) ?? null;
  const selectedDay = days[dayIdx]!;
  const slot = slotIdx != null ? SLOTS[slotIdx] : null;
  const canConfirm = !!pet && !!slot;

  // Pago suspendido temporalmente: agendamos directo, sin pasar por ConfirmPay.
  const confirm = async () => {
    if (!pet || !slot) return;
    const when = new Date(selectedDay);
    when.setHours(slot.h, slot.m, 0, 0);
    if (when.getTime() <= Date.now()) return appAlert('Horario no disponible', 'Ese horario ya pasó. Elige otro.');
    setBooking(true);
    try {
      await api('/me/appointments', {
        method: 'POST',
        body: { clinicId, petId: pet.id, serviceId: service.id, scheduledAt: when.toISOString(), paid: false },
      });
      appAlert('¡Cita agendada! 🐾', `${service.name} en ${clinicName} · ${DOW[selectedDay.getDay()]} ${selectedDay.getDate()}, ${slot.label}.`, [
        { text: 'Listo', onPress: () => navigation.navigate('Tabs', { screen: 'Home' }) },
      ]);
    } catch (e) {
      appAlert('No se pudo agendar', e instanceof Error ? e.message : 'Intenta de nuevo.');
    } finally {
      setBooking(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Agendar Cita</Text>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        {/* Resumen mascota + servicio */}
        <View style={styles.summary}>
          <View style={styles.summaryLeft}>
            {pet?.photoUrl ? (
              <Image source={{ uri: pet.photoUrl }} style={styles.petImg} />
            ) : (
              <View style={[styles.petImg, styles.petPh]}>
                <Text style={{ fontSize: 20 }}>{pet?.species === 'CAT' ? '🐈' : '🐕'}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.petName}>{pet?.name ?? 'Mascota'}</Text>
              <Text style={styles.svcLine} numberOfLines={2}>✂️ {service.name} en {clinicName}</Text>
            </View>
          </View>
          <View style={styles.priceTag}>
            <Text style={styles.priceText}>${price.toFixed(2)}</Text>
          </View>
        </View>

        {/* Selector de mascota (si hay más de una) */}
        {petList.length > 1 && (
          <>
            <Text style={styles.label}>MASCOTA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {petList.map((p) => (
                <Pressable key={p.id} onPress={() => setPetId(p.id)} style={[styles.petChip, petId === p.id && styles.petChipOn]}>
                  <Text style={{ fontSize: 16 }}>{p.species === 'CAT' ? '🐈' : '🐕'}</Text>
                  <Text style={[styles.petChipText, petId === p.id && styles.petChipTextOn]}>{p.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {/* Día */}
        <Text style={styles.label}>SELECCIONA EL DÍA</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {days.map((d, i) => (
            <Pressable key={i} onPress={() => { setDayIdx(i); setSlotIdx(null); }} style={{ alignItems: 'center' }}>
              <View style={[styles.day, dayIdx === i && styles.dayOn]}>
                <Text style={[styles.dayDow, dayIdx === i && styles.dayTextOn]}>{DOW[d.getDay()]}</Text>
                <Text style={[styles.dayNum, dayIdx === i && styles.dayTextOn]}>{d.getDate()}</Text>
                <Text style={[styles.dayMon, dayIdx === i && styles.dayTextOn]}>{MONTHS[d.getMonth()]}</Text>
              </View>
              {i === 0 && <Text style={styles.today}>Hoy</Text>}
            </Pressable>
          ))}
        </ScrollView>

        {/* Horarios */}
        <Text style={styles.label}>HORARIOS DISPONIBLES</Text>
        <View style={styles.slots}>
          {SLOTS.map((s, i) => {
            // Deshabilita horas ya pasadas (solo afecta a "Hoy"; días futuros siempre en el futuro).
            const slotDate = new Date(selectedDay);
            slotDate.setHours(s.h, s.m, 0, 0);
            const past = slotDate.getTime() <= Date.now();
            const disabled = s.off || past;
            const on = slotIdx === i;
            const kind = disabled ? 'x' : s.h < 12 ? 'sunrise' : 'sun';
            const iconColor = disabled ? '#9CA3AF' : on ? colors.brand : '#6B7280';
            return (
              <Pressable
                key={i}
                disabled={disabled}
                onPress={() => setSlotIdx(i)}
                style={[styles.slot, on && styles.slotOn, disabled && styles.slotOff]}
              >
                <SlotIcon kind={kind} color={iconColor} size={22} />
                <Text style={[styles.slotText, on && styles.slotTextOn, disabled && styles.slotTextOff]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {petList.length === 0 && <Muted>Registra una mascota para poder agendar.</Muted>}
      </ScrollView>

      {/* CTA */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <Pressable
          onPress={confirm}
          disabled={!canConfirm || booking}
          style={[styles.cta, (!canConfirm || booking) && { opacity: 0.4 }]}
        >
          <Text style={styles.ctaText}>
            {booking ? 'Agendando…' : slot ? `Confirmar Reserva · ${DOW[selectedDay.getDay()]} ${selectedDay.getDate()}, ${slot.label}` : 'Selecciona un horario'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  close: { fontSize: 22, color: colors.text, fontWeight: '700' },

  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, boxShadow: cardShadow },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  petImg: { width: 44, height: 44, borderRadius: 12 },
  petPh: { backgroundColor: '#EFE3F5', alignItems: 'center', justifyContent: 'center' },
  petName: { fontSize: 16, fontWeight: '800', color: colors.text },
  svcLine: { fontSize: 13, color: colors.muted, marginTop: 2 },
  priceTag: { backgroundColor: '#FEF7C9', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  priceText: { fontSize: 16, fontWeight: '900', color: colors.text },

  label: { fontSize: 12, fontWeight: '800', color: colors.muted, letterSpacing: 0.6, marginTop: 22, marginBottom: 10 },

  petChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border },
  petChipOn: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  petChipText: { fontWeight: '700', color: colors.text },
  petChipTextOn: { color: colors.brand },

  day: { width: 66, borderRadius: radius.md, backgroundColor: colors.white, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1.5, borderColor: colors.border },
  dayOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayDow: { fontSize: 13, color: colors.muted, fontWeight: '700' },
  dayNum: { fontSize: 20, fontWeight: '900', color: colors.text, marginVertical: 1 },
  dayMon: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  dayTextOn: { color: colors.white },
  today: { fontSize: 11, color: colors.muted, marginTop: 4, fontWeight: '600' },

  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  slot: { width: '47%', flexGrow: 1, alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 16, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border },
  slotOn: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  slotOff: { backgroundColor: '#F1F1F4', borderColor: '#F1F1F4' },
  slotText: { fontSize: 16, fontWeight: '800', color: colors.text },
  slotTextOn: { color: colors.brand },
  slotTextOff: { color: colors.muted },

  footer: { padding: 20, paddingTop: 10, backgroundColor: colors.canvas, borderTopWidth: 1, borderTopColor: '#EFEBF2' },
  cta: { backgroundColor: colors.brand, borderRadius: 16, height: 56, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: colors.white, fontWeight: '800', fontSize: 16 },
});
