import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { useAuth } from '../lib/auth';
import { TabIcon } from '../components/TabIcon';
import { Loading } from '../components/ui';
import { cardShadow, colors, radius, type } from '../theme';

interface Appt {
  id: string;
  scheduledAt: string;
  status: string;
  reason?: string | null;
  pet: { id: string; name: string; species?: string; owner?: { fullName: string } | null };
  service?: { name: string } | null;
}
interface EmgAlert {
  distanceKm?: string | number | null;
  emergency: {
    id: string;
    symptoms?: string | null;
    aiSummary?: string | null;
    pet?: {
      name: string;
      species?: string | null;
      breed?: string | null;
      owner?: { fullName?: string | null } | null;
    } | null;
  };
}

const timeLabel = (iso: string) => {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h.toString().padStart(2, '0')}:${m} ${ap}`;
};

// Etiqueta corta del turno para el chip "Turno: X"
const SHIFT_LABEL: Record<string, string> = {
  MORNING: 'M',
  AFTERNOON: 'T',
  NIGHT: 'N',
  FULL_DAY: 'Completo',
};

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  CONFIRMED: { label: 'Confirmada', bg: colors.brand, fg: colors.white },
  PENDING: { label: 'Pendiente', bg: '#FDEEC8', fg: colors.amber },
  IN_PROGRESS: { label: 'En sala', bg: '#E7CFF1', fg: colors.brand },
  COMPLETED: { label: 'Completada', bg: '#DFF3E6', fg: colors.green },
};

export default function HomeScreen({ navigation }: { navigation: any }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [available, setAvailable] = useState(true);

  const staff = user?.staffProfile;
  const firstName = user?.fullName?.replace(/^Dr\.?a?\.?\s*/i, '').split(' ')[0] ?? '';
  const rating = staff?.ratingAvg != null ? Number(staff.ratingAvg) : null;
  const ratingCount = staff?.ratingCount ?? 0;
  const isVerified = staff?.verificationStatus === 'VERIFIED';
  const shiftLabel = staff?.currentShift ? SHIFT_LABEL[staff.currentShift] ?? staff.currentShift : null;
  const exp = staff?.experienceYears ?? null;

  // Marcar una cita como concluida -> habilita la calificación del servicio en la app del dueño
  const complete = useMutation({
    mutationFn: (id: string) => api(`/appointments/${id}/status`, { method: 'POST', body: { status: 'COMPLETED' } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vet-appts-today'] }),
    onError: (e) => appAlert('No se pudo concluir', e instanceof Error ? e.message : 'Intenta de nuevo'),
  });
  const confirmComplete = (a: Appt) =>
    appAlert('Concluir cita', `¿Marcar como concluida la cita de ${a.pet.name}? El dueño podrá calificar el servicio.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Concluir', onPress: () => complete.mutate(a.id) },
    ]);

  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);

  const appts = useQuery({
    queryKey: ['vet-appts-today'],
    queryFn: () => api<{ data: Appt[] }>(`/appointments?from=${startToday.toISOString()}&to=${endToday.toISOString()}`),
    refetchInterval: 30000,
  });
  const emergencies = useQuery({
    queryKey: ['vet-emergencies'],
    queryFn: () => api<{ data: EmgAlert[] }>('/emergencies/active'),
    refetchInterval: 15000,
  });

  const list = (appts.data?.data ?? []).slice().sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const pendientes = list.filter((a) => a.status === 'PENDING').length;
  const emg = emergencies.data?.data?.[0] ?? null;
  const emgPet = emg?.emergency.pet;
  const emgBreed = emgPet?.breed || emgPet?.species || null;
  const emgSymptom = emg?.emergency.aiSummary ?? emg?.emergency.symptoms ?? null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.userRow} onPress={() => navigation.navigate('Perfil')}>
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatarSm} />
            ) : (
              <View style={[styles.avatarSm, styles.avatarPh]}><Text style={styles.avatarTxtSm}>{firstName[0] ?? 'D'}</Text></View>
            )}
            <View>
              <Text style={styles.welcome}>Bienvenido de vuelta</Text>
              <Text style={styles.hi}>¡Hola, Dr. {firstName || 'Doctor'}!</Text>
            </View>
          </Pressable>
          <Pressable
            style={[styles.availPill, { borderColor: available ? colors.green : colors.border }]}
            onPress={() => setAvailable((v) => !v)}
          >
            <Text style={[styles.availTxt, { color: available ? colors.green : colors.muted }]}>
              {available ? 'Disponible' : 'Ausente'}
            </Text>
            <Switch
              value={available}
              onValueChange={setAvailable}
              trackColor={{ true: colors.green, false: '#CBD5E1' }}
              thumbColor={colors.white}
              style={styles.availSwitch}
            />
          </Pressable>
        </View>

        {/* Tarjeta de perfil profesional */}
        <Pressable style={styles.profileCard} onPress={() => navigation.navigate('Perfil')}>
          <View style={styles.profileTop}>
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatarLg} />
            ) : (
              <View style={[styles.avatarLg, styles.avatarPh]}><Text style={styles.avatarTxtLg}>{firstName[0] ?? 'D'}</Text></View>
            )}
            <View style={styles.profileInfo}>
              {rating != null && (
                <View style={styles.ratingRow}>
                  <Text style={styles.star}>★</Text>
                  <Text style={styles.ratingNum}>{rating.toFixed(1)}</Text>
                  <Text style={styles.ratingCount}>({ratingCount})</Text>
                </View>
              )}
              <Text style={styles.docName} numberOfLines={1}>{user?.fullName ?? 'Doctor'}</Text>
              <Text style={styles.specLabel}>Especialidad:</Text>
              <Text style={styles.specValue} numberOfLines={2}>{staff?.specialty ?? 'Medicina general'}</Text>
            </View>
            <View style={styles.profileArrow}>
              <TabIcon name="chevron-right" color={colors.white} size={20} />
            </View>
          </View>
          <View style={styles.chipRow}>
            {exp != null && (
              <View style={styles.chipOutline}><Text style={styles.chipOutlineTxt}>Exp: {exp} años</Text></View>
            )}
            {shiftLabel && (
              <View style={styles.chipOutline}><Text style={styles.chipOutlineTxt}>Turno: {shiftLabel}</Text></View>
            )}
            <View style={[styles.chipVerified, !isVerified && styles.chipPending]}>
              <Text style={[styles.chipVerifiedTxt, !isVerified && styles.chipPendingTxt]}>
                {isVerified ? '✓ Verificado' : 'Sin verificar'}
              </Text>
            </View>
          </View>
        </Pressable>

        {/* Emergencia */}
        {emg && (
          <View style={styles.emgCard}>
            <Text style={styles.emgTitle}>
              ⚠️ EMERGENCIA DETECTADA{emg.distanceKm != null ? ` · A ${Number(emg.distanceKm).toFixed(1)} Km` : ''}
            </Text>
            {(emgPet || emg.emergency.pet?.owner) && (
              <Text style={styles.emgMeta}>
                {emgPet?.name ? <Text style={styles.emgMetaBold}>Mascota: </Text> : null}
                {emgPet?.name}{emgBreed ? ` (${emgBreed})` : ''}
                {emgPet?.owner?.fullName ? `  ·  ` : ''}
                {emgPet?.owner?.fullName ? <Text style={styles.emgMetaBold}>Dueño: </Text> : null}
                {emgPet?.owner?.fullName ?? ''}
              </Text>
            )}
            {emgSymptom && (
              <Text style={styles.emgSymptom}>
                <Text style={styles.emgSymptomLabel}>Síntoma: </Text>{emgSymptom}
              </Text>
            )}
            <Pressable style={styles.emgBtn} onPress={() => navigation.navigate('Alerta')}>
              <TabIcon name="navigation" color={colors.white} size={18} />
              <Text style={styles.emgBtnTxt}>ACEPTAR Y VER RUTA</Text>
            </Pressable>
          </View>
        )}

        {/* Citas de hoy */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Citas de Hoy{pendientes ? ` (${pendientes} pendientes)` : ''}</Text>
          <Pressable onPress={() => navigation.navigate('Clientes')}><Text style={styles.link}>Ver todo</Text></Pressable>
        </View>

        {appts.isLoading ? (
          <Loading />
        ) : list.length === 0 ? (
          <View style={styles.empty}><TabIcon name="calendar" color="#C9BBD3" size={40} /><Text style={styles.emptyTxt}>No hay citas para hoy.</Text></View>
        ) : (
          list.map((a) => {
            const st = STATUS[a.status] ?? STATUS.PENDING;
            return (
              <Pressable key={a.id} style={styles.apptCard} onPress={() => navigation.navigate('PatientDetail', { petId: a.pet.id, name: a.pet.name })}>
                <View style={styles.apptRow}>
                  <View style={styles.apptLeft}>
                    <Text style={styles.apptTime} numberOfLines={1}>
                      ⏰ {timeLabel(a.scheduledAt)} - {a.service?.name ?? a.reason ?? 'Consulta'}
                    </Text>
                    <Text style={styles.apptOwner}>Dueño: {a.pet.owner?.fullName ?? '—'}</Text>
                  </View>
                  <View style={styles.apptRight}>
                    <View style={styles.petPill}><Text style={styles.petPillTxt}>Paciente: {a.pet.name}</Text></View>
                    <View style={[styles.badge, { backgroundColor: st.bg }]}><Text style={[styles.badgeTxt, { color: st.fg }]}>{st.label}</Text></View>
                  </View>
                </View>
                {['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(a.status) && (
                  <Pressable style={styles.concludeBtn} onPress={() => confirmComplete(a)} disabled={complete.isPending}>
                    <Text style={styles.concludeTxt}>✓ Marcar concluida</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })
        )}

        {/* Acciones rápidas */}
        <Text style={styles.sectionTitle}>Acciones Rápidas</Text>
        <Pressable style={styles.quick} onPress={() => navigation.navigate('Clientes')}>
          <View style={styles.quickIcon}><TabIcon name="file" color={colors.brand} size={22} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.quickTitle}>Nuevo Informe</Text>
            <Text style={styles.quickSub}>Inicia receta rápida con dictado de voz</Text>
          </View>
        </Pressable>
        <Pressable style={styles.quick} onPress={() => navigation.navigate('Chats')}>
          <View style={styles.quickIcon}><TabIcon name="chat" color={colors.brand} size={22} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.quickTitle}>Chat Soporte</Text>
            <Text style={styles.quickSub}>Bandeja de consultas médicas activas</Text>
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatarSm: { width: 44, height: 44, borderRadius: 22 },
  avatarPh: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarTxtSm: { color: colors.white, fontSize: 18, fontWeight: '800' },
  welcome: { fontSize: 13, color: colors.muted },
  hi: { fontSize: 18, fontWeight: '800', color: colors.text },
  availPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: radius.full, paddingLeft: 12, paddingRight: 6, paddingVertical: 3, backgroundColor: colors.white },
  availTxt: { fontSize: 12, fontWeight: '700' },
  availSwitch: { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] },

  // Tarjeta de perfil profesional
  profileCard: { backgroundColor: colors.brandLight, borderRadius: radius.xl, padding: 16, marginBottom: 20, boxShadow: cardShadow },
  profileTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  avatarLg: { width: 84, height: 84, borderRadius: radius.lg },
  avatarTxtLg: { color: colors.white, fontSize: 34, fontWeight: '800' },
  profileInfo: { flex: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 },
  star: { color: colors.accent, fontSize: 15 },
  ratingNum: { color: colors.text, fontWeight: '800', fontSize: 14 },
  ratingCount: { color: colors.muted, fontSize: 13 },
  docName: { fontSize: 21, fontWeight: '900', color: colors.text },
  specLabel: { fontSize: 13, color: colors.muted, marginTop: 4 },
  specValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  profileArrow: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chipOutline: { backgroundColor: colors.white, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5 },
  chipOutlineTxt: { color: colors.brand, fontWeight: '700', fontSize: 12 },
  chipVerified: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DFF3E6', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5 },
  chipVerifiedTxt: { color: colors.green, fontWeight: '800', fontSize: 12 },
  chipPending: { backgroundColor: '#FDEEC8' },
  chipPendingTxt: { color: colors.amber },

  emgCard: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: '#F2A3A3', borderRadius: radius.lg, padding: 16, marginBottom: 20, boxShadow: cardShadow },
  emgTitle: { color: colors.red, fontWeight: '900', fontSize: 14 },
  emgMeta: { color: colors.text, fontSize: 14, marginTop: 8 },
  emgMetaBold: { fontWeight: '800' },
  emgSymptom: { color: colors.red, fontWeight: '600', fontSize: 15, marginTop: 6, marginBottom: 14 },
  emgSymptomLabel: { fontWeight: '900' },
  emgBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 13 },
  emgBtnTxt: { color: colors.white, fontWeight: '800', fontSize: 15 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 6 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 18, marginBottom: 12 },
  link: { color: colors.brand, fontWeight: '700', fontSize: 14 },

  apptCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, marginBottom: 12, boxShadow: cardShadow, borderLeftWidth: 4, borderLeftColor: colors.brand },
  apptRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  apptLeft: { flex: 1 },
  apptTime: { fontSize: 15, fontWeight: '800', color: colors.text },
  apptOwner: { fontSize: 14, color: colors.muted, marginTop: 6 },
  apptRight: { alignItems: 'flex-end', gap: 6 },
  petPill: { backgroundColor: colors.brandLight, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5 },
  petPillTxt: { color: colors.brand, fontWeight: '700', fontSize: 12 },
  badge: { borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  badgeTxt: { ...type.bodySmall, fontWeight: '700' },
  concludeBtn: { marginTop: 12, borderWidth: 1.5, borderColor: colors.green, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  concludeTxt: { color: colors.green, fontWeight: '800', fontSize: 14 },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 30 },
  emptyIcon: { fontSize: 36 },
  emptyTxt: { color: colors.muted, fontSize: 14 },

  quick: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, marginBottom: 12, boxShadow: cardShadow },
  quickIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  quickTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  quickSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
});
