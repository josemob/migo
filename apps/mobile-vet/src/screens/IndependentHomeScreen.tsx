import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { appAlert } from '../lib/dialog';
import { Badge, Button, Card, Loading } from '../components/ui';
import { SpecialtyRequestModal } from '../components/SpecialtyRequestModal';
import { BiometricToggle } from '../components/BiometricToggle';
import { IncomingEmergencies } from '../components/IncomingEmergencies';
import { cardShadow, colors, radius } from '../theme';

interface VetProfileResp {
  profile: {
    specialty: string | null;
    collegiateNumber: string | null;
    experienceYears: number | null;
    verificationStatus: string;
    serviceLat: number | null;
    serviceLng: number | null;
    serviceRadiusKm: number;
    ratingAvg: number;
    ratingCount: number;
  } | null;
  subscription: { plan: string; status: string } | null;
  isIndependent: boolean;
  hasClinic: boolean;
  telemedicineActive: boolean;
  pendingSpecialty: string | null; // cambio de especialidad en revisión
}

interface Teleconsult {
  id: string;
  status: string;
  createdAt: string;
  ownerName: string | null;
  petName: string | null;
  reason: string | null;
}

interface Invitation {
  id: string;
  position: string;
  clinic: { name: string; city?: string | null } | null;
}

const TELE_STATUS: Record<string, { label: string; color: string }> = {
  SCHEDULED: { label: 'Programada', color: colors.amber },
  WAITING: { label: 'En espera', color: colors.amber },
  ONGOING: { label: 'En curso', color: colors.brand },
  COMPLETED: { label: 'Completada', color: colors.green },
  CANCELLED: { label: 'Cancelada', color: colors.muted },
  NO_SHOW: { label: 'No asistió', color: colors.red },
};

export default function IndependentHomeScreen({
  onJoinedClinic,
  onEnterDashboard,
}: {
  onJoinedClinic: () => void;
  onEnterDashboard?: () => void;
}) {
  const { user, logout, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();

  const profileQ = useQuery({ queryKey: ['vet-profile'], queryFn: () => api<VetProfileResp>('/me/vet-profile') });
  const teleQ = useQuery({ queryKey: ['my-teleconsults'], queryFn: () => api<{ data: Teleconsult[] }>('/me/teleconsults') });
  const invitesQ = useQuery({
    queryKey: ['my-invitations'],
    queryFn: () => api<{ data: Invitation[] }>('/staff-kyc/invitations'),
    refetchInterval: 20000,
  });

  // Estado editable del perfil (se siembra cuando llega la data)
  const [experience, setExperience] = useState('');
  const [radius_, setRadius] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [specialtyModal, setSpecialtyModal] = useState(false);

  useEffect(() => {
    const p = profileQ.data?.profile;
    if (p && !seeded) {
      setExperience(p.experienceYears != null ? String(p.experienceYears) : '');
      setRadius(String(p.serviceRadiusKm ?? 15));
      if (p.serviceLat != null && p.serviceLng != null) setCoords({ lat: p.serviceLat, lng: p.serviceLng });
      setSeeded(true);
    }
  }, [profileQ.data, seeded]);

  const useMyLocation = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return appAlert('Permiso de ubicación', 'Actívalo para definir tu zona de servicio.');
    const pos = await Location.getCurrentPositionAsync({});
    setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
  };

  const save = useMutation({
    mutationFn: () =>
      api('/me/vet-profile', {
        method: 'PATCH',
        body: {
          experienceYears: experience.trim() ? Number(experience) : null,
          serviceRadiusKm: radius_.trim() ? Number(radius_) : undefined,
          ...(coords ? { serviceLat: coords.lat, serviceLng: coords.lng } : {}),
        },
      }),
    onSuccess: () => { appAlert('Perfil actualizado', 'Tus datos profesionales se guardaron.'); void profileQ.refetch(); },
    onError: (e) => appAlert('No se pudo guardar', e instanceof Error ? e.message : 'Intenta de nuevo.'),
  });

  const respondInvite = useMutation({
    mutationFn: (v: { id: string; accept: boolean }) => api(`/staff-kyc/invitations/${v.id}/respond`, { method: 'POST', body: { accept: v.accept } }),
    onSuccess: async (_r, v) => {
      if (v.accept) { await refreshUser(); onJoinedClinic(); }
      else void invitesQ.refetch();
    },
  });

  if (profileQ.isLoading) return <Loading />;

  const data = profileQ.data;
  const sub = data?.subscription;
  const teleActive = !!data?.telemedicineActive;
  const invites = invitesQ.data?.data ?? [];
  const teleconsults = teleQ.data?.data ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <View>
          <Text style={styles.brand}>Migo <Text style={styles.brandVet}>VET</Text></Text>
          <Text style={styles.headSub}>Profesional independiente</Text>
        </View>
        <Pressable onPress={logout} hitSlop={10}><Text style={styles.logout}>Salir</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 16 }} showsVerticalScrollIndicator={false}>
        {/* Emergencias entrantes ruteadas por IA (Fase C) — prioridad arriba */}
        <IncomingEmergencies />

        {/* Estado de verificación + telemedicina */}
        <Card>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Estado</Text>
            <Badge text="Verificado" color={colors.green} />
          </View>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: teleActive ? colors.green : colors.amber }]} />
            <Text style={styles.statusTxt}>
              {teleActive ? 'Telemedicina activa' : 'Telemedicina inactiva'}
              {sub ? ` · plan ${sub.plan}` : ''}
            </Text>
          </View>
          <Text style={styles.hint}>Puedes atender teleconsultas mientras tu suscripción esté activa.</Text>
          {onEnterDashboard && (
            <View style={{ marginTop: 14 }}>
              <Button title="Ir al panel principal →" onPress={onEnterDashboard} />
            </View>
          )}
        </Card>

        {/* Perfil profesional editable */}
        <Card>
          <Text style={styles.cardTitle}>Perfil profesional</Text>
          {data?.profile?.collegiateNumber ? (
            <Text style={styles.metaLine}>Colegiado: <Text style={styles.metaStrong}>{data.profile.collegiateNumber}</Text></Text>
          ) : null}

          <Text style={styles.label}>Especialidades</Text>
          {data?.pendingSpecialty ? (
            <View style={styles.pendingBox}>
              <Text style={styles.pendingTitle}>⏳ Cambio en revisión</Text>
              <Text style={styles.pendingVal}>{data.pendingSpecialty}</Text>
              <Text style={styles.pendingHint}>Se aplicará cuando el Super Admin apruebe tus documentos.</Text>
            </View>
          ) : (
            <>
              <View style={styles.specBox}>
                <Text style={styles.specVal}>{data?.profile?.specialty || 'Sin especialidad definida'}</Text>
              </View>
              <Pressable style={styles.editSpecBtn} onPress={() => setSpecialtyModal(true)}>
                <Text style={styles.editSpecTxt}>Editar especialidades</Text>
              </Pressable>
            </>
          )}

          <Text style={styles.label}>Años de experiencia</Text>
          <TextInput style={styles.input} value={experience} onChangeText={setExperience} keyboardType="number-pad" placeholder="Ej. 5" placeholderTextColor={colors.muted} />

          <Text style={styles.label}>Radio de servicio (km)</Text>
          <TextInput style={styles.input} value={radius_} onChangeText={setRadius} keyboardType="number-pad" placeholder="15" placeholderTextColor={colors.muted} />

          <Text style={styles.label}>Zona de servicio</Text>
          <Pressable style={styles.locBtn} onPress={useMyLocation}>
            <Text style={styles.locBtnTxt}>{coords ? '📍 Ubicación definida · tocar para actualizar' : '📍 Usar mi ubicación actual'}</Text>
          </Pressable>

          <View style={{ marginTop: 16 }}>
            <Button title={save.isPending ? 'Guardando…' : 'Guardar perfil'} onPress={() => save.mutate()} loading={save.isPending} />
          </View>
        </Card>

        {/* Acceso por huella / rostro */}
        <BiometricToggle />

        {/* Invitaciones de clínicas (aún puede ser reclutado) */}
        {invites.length > 0 && (
          <Card>
            <Text style={styles.cardTitle}>Invitaciones de clínicas ({invites.length})</Text>
            <View style={{ gap: 10, marginTop: 8 }}>
              {invites.map((inv) => (
                <View key={inv.id} style={styles.invCard}>
                  <Text style={styles.invClinic}>{inv.clinic?.name ?? 'Una clínica'}</Text>
                  {inv.clinic?.city ? <Text style={styles.invSub}>{inv.clinic.city}</Text> : null}
                  <View style={styles.invBtns}>
                    <Pressable style={[styles.invBtn, styles.invReject]} disabled={respondInvite.isPending} onPress={() => respondInvite.mutate({ id: inv.id, accept: false })}>
                      <Text style={styles.invRejectTxt}>Rechazar</Text>
                    </Pressable>
                    <Pressable style={[styles.invBtn, styles.invAccept]} disabled={respondInvite.isPending} onPress={() => respondInvite.mutate({ id: inv.id, accept: true })}>
                      <Text style={styles.invAcceptTxt}>Unirme</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Historial de teleconsultas */}
        <Card>
          <Text style={styles.cardTitle}>Teleconsultas</Text>
          {teleQ.isLoading ? (
            <Loading />
          ) : teleconsults.length === 0 ? (
            <Text style={styles.hint}>Aún no tienes teleconsultas. Cuando atiendas una, aparecerá aquí.</Text>
          ) : (
            <View style={{ gap: 10, marginTop: 8 }}>
              {teleconsults.map((t) => {
                const st = TELE_STATUS[t.status] ?? { label: t.status, color: colors.muted };
                return (
                  <View key={t.id} style={styles.teleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.teleWho}>{t.ownerName ?? 'Dueño'}{t.petName ? ` · ${t.petName}` : ''}</Text>
                      {t.reason ? <Text style={styles.teleReason} numberOfLines={1}>{t.reason}</Text> : null}
                      <Text style={styles.teleDate}>{new Date(t.createdAt).toLocaleDateString()}</Text>
                    </View>
                    <Badge text={st.label} color={st.color} />
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {/* Cédula para ser reclutado por una clínica */}
        {user?.nationalId ? (
          <Card>
            <Text style={styles.cardTitle}>¿Una clínica quiere sumarte?</Text>
            <Text style={styles.hint}>Te agregan por tu cédula. Compártela con la clínica.</Text>
            <View style={styles.cedulaBox}><Text style={styles.cedula}>{user.nationalId}</Text></View>
          </Card>
        ) : null}
      </ScrollView>

      <SpecialtyRequestModal
        visible={specialtyModal}
        initialSpecialty={data?.profile?.specialty ?? ''}
        onClose={() => setSpecialtyModal(false)}
        onSubmitted={() => void profileQ.refetch()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  brand: { fontSize: 22, fontWeight: '900', color: colors.brand },
  brandVet: { fontSize: 13 },
  headSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  logout: { color: colors.muted, fontWeight: '700', fontSize: 14 },

  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusTxt: { fontSize: 15, fontWeight: '700', color: colors.text },
  hint: { fontSize: 13, color: colors.muted, marginTop: 8, lineHeight: 19 },
  metaLine: { fontSize: 14, color: colors.muted, marginTop: 6 },
  metaStrong: { color: colors.text, fontWeight: '700' },

  specBox: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 },
  specVal: { fontSize: 15, color: colors.text, fontWeight: '600' },
  editSpecBtn: { borderWidth: 1.5, borderColor: colors.brand, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center', marginTop: 8 },
  editSpecTxt: { color: colors.brand, fontWeight: '800', fontSize: 14 },
  pendingBox: { backgroundColor: '#FDEEC8', borderRadius: radius.md, padding: 14 },
  pendingTitle: { fontSize: 14, fontWeight: '800', color: colors.amber },
  pendingVal: { fontSize: 15, color: colors.text, fontWeight: '700', marginTop: 4 },
  pendingHint: { fontSize: 12, color: colors.muted, marginTop: 4, lineHeight: 17 },

  label: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 16, marginBottom: 8 },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text },
  locBtn: { backgroundColor: colors.brandLight, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13 },
  locBtnTxt: { color: colors.brandDark, fontWeight: '700', fontSize: 14 },

  invCard: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, borderWidth: 2, borderColor: colors.brandLight },
  invClinic: { fontSize: 16, fontWeight: '800', color: colors.text },
  invSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  invBtns: { flexDirection: 'row', gap: 10, marginTop: 12 },
  invBtn: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: radius.md },
  invReject: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border },
  invRejectTxt: { color: colors.muted, fontWeight: '800', fontSize: 14 },
  invAccept: { backgroundColor: colors.brand },
  invAcceptTxt: { color: colors.white, fontWeight: '800', fontSize: 14 },

  teleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.md, padding: 12, boxShadow: cardShadow },
  teleWho: { fontSize: 15, fontWeight: '700', color: colors.text },
  teleReason: { fontSize: 13, color: colors.muted, marginTop: 2 },
  teleDate: { fontSize: 12, color: colors.muted, marginTop: 3 },

  cedulaBox: { backgroundColor: colors.brandLight, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  cedula: { fontSize: 20, fontWeight: '900', color: colors.brandDark, letterSpacing: 1 },
});
