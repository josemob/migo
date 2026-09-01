import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { useStream } from '../lib/stream';
import { requestCallPermissions } from '../lib/callPermissions';
import { Loading } from '../components/ui';
import { TabIcon } from '../components/TabIcon';
import { cardShadow, colors, radius, triageColor, triageLabel } from '../theme';

interface ActiveAlert {
  id: string; // id de la alerta
  status: string;
  distanceKm?: string | number | null;
  etaMinutes?: number | null;
  emergency: {
    id: string;
    symptoms?: string | null;
    triageLevel?: string | null;
    aiSummary?: string | null;
    aiFirstAid?: string | null;
    status: string;
    pet: {
      name: string;
      breed?: string | null;
      species?: string;
      owner: { id: string; fullName: string; phone?: string | null; nationalId?: string | null };
      allergies: { substance: string }[];
      conditions: { name: string }[];
    };
  };
}

export default function AlertScreen({ navigation }: { navigation: any }) {
  const qc = useQueryClient();
  const { chatClient, videoClient, streamUserId } = useStream();
  const q = useQuery({
    queryKey: ['vet-active-emergencies'],
    queryFn: () => api<{ data: ActiveAlert[] }>('/emergencies/active'),
    refetchInterval: 12000,
  });

  const accept = useMutation({
    mutationFn: (alertId: string) => api(`/emergencies/alerts/${alertId}/accept`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vet-active-emergencies'] }),
    onError: (e) => appAlert('No se pudo aceptar', e instanceof Error ? e.message : 'Puede que otra clínica ya la haya tomado.'),
  });

  // La llamada se ANILLA DESDE EL CLIENTE (patrón recomendado por Stream): así el
  // dispositivo que llama entra al ciclo de vida de "saliente" correctamente y no se
  // queda atascado en "preparing call" (crear la sala en el servidor no lo hacía).
  const videoCall = useMutation({
    mutationFn: async (ownerId: string) => {
      const ok = await requestCallPermissions();
      if (!ok) throw new Error('Activa cámara y micrófono para hacer videollamadas.');
      if (!videoClient || !streamUserId) throw new Error('El video aún se está conectando. Reintenta en unos segundos.');
      // El id de la sala debe ser <= 64 chars (Stream). Uno corto y único basta;
      // los participantes van en `members`, no en el id.
      const callId = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const call = videoClient.call('default', callId);
      await call.getOrCreate({
        ring: true,
        data: { members: [{ user_id: streamUserId }, { user_id: ownerId }], custom: { video: true } },
      });
      return call.cid;
    },
    onError: (e) => appAlert('No se pudo iniciar la videollamada', e instanceof Error ? e.message : 'Intenta de nuevo.'),
  });

  // Finaliza la consulta: marca la urgencia como atendida (genera el cargo CPL) y la
  // saca de la guardia.
  const finish = useMutation({
    mutationFn: (emergencyId: string) => api(`/emergencies/${emergencyId}/attended`, { method: 'POST', body: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vet-active-emergencies'] });
      appAlert('Consulta finalizada', 'La urgencia quedó marcada como atendida.');
    },
    onError: (e) => appAlert('No se pudo finalizar', e instanceof Error ? e.message : 'Intenta de nuevo.'),
  });
  const confirmFinish = (emergencyId: string) =>
    appAlert('Finalizar consulta', '¿Marcar esta urgencia como atendida? Se cerrará y ya no aparecerá en tu guardia.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Finalizar', onPress: () => finish.mutate(emergencyId) },
    ]);

  const openChat = async (ownerId: string, clientName: string) => {
    if (!chatClient?.userID) return appAlert('Chat no disponible', 'Conectando el chat… reintenta en unos segundos.');
    try {
      const ch = chatClient.channel('messaging', { members: [chatClient.userID, ownerId] });
      await ch.watch();
      navigation.navigate('ChatThread', { channelType: 'messaging', channelId: ch.id, clientName });
    } catch (e) {
      appAlert('No se pudo abrir el chat', e instanceof Error ? e.message : 'Intenta de nuevo.');
    }
  };

  const alerts = q.data?.data ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}><Text style={styles.title}>Guardia & Emergencias</Text></View>

      {q.isLoading ? (
        <Loading />
      ) : alerts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.icon}>🚨</Text>
          <Text style={styles.emptyTxt}>No hay emergencias entrantes ahora mismo.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {alerts.map((a) => {
            const e = a.emergency;
            const level = e.triageLevel ?? 'ORANGE';
            const tc = triageColor[level] ?? colors.amber;
            const mine = a.status === 'ACCEPTED'; // esta clínica la aceptó
            const km = a.distanceKm != null ? `${Number(a.distanceKm).toFixed(1)} km` : null;
            return (
              <View key={a.id} style={[styles.card, { borderColor: tc }]}>
                <View style={styles.top}>
                  <View style={[styles.badge, { backgroundColor: tc }]}><Text style={styles.badgeTxt}>{triageLabel[level] ?? level}</Text></View>
                  {km && <Text style={styles.dist}>{km}{a.etaMinutes ? ` · ~${a.etaMinutes} min` : ''}</Text>}
                </View>

                <Text style={styles.pet}>{e.pet.name}{e.pet.breed ? ` · ${e.pet.breed}` : ''}</Text>
                <Text style={styles.summary}>{e.aiSummary || e.symptoms}</Text>
                {e.aiFirstAid ? <Text style={styles.firstAid}>Primeros auxilios: {e.aiFirstAid}</Text> : null}

                {mine ? (
                  <View style={styles.acceptedBox}>
                    <Text style={styles.acceptedTitle}>✅ Aceptada · contacto del dueño</Text>
                    <Text style={styles.ownerName}>{e.pet.owner.fullName}{e.pet.owner.nationalId ? ` · ${e.pet.owner.nationalId}` : ''}</Text>
                    {e.pet.allergies.length > 0 && <Text style={styles.med}>Alergias: {e.pet.allergies.map((x) => x.substance).join(', ')}</Text>}
                    {e.pet.conditions.length > 0 && <Text style={styles.med}>Condiciones: {e.pet.conditions.map((x) => x.name).join(', ')}</Text>}
                    <View style={styles.actionRow}>
                      <Pressable style={[styles.actionBtn, styles.chat]} onPress={() => openChat(e.pet.owner.id, e.pet.owner.fullName)}>
                        <TabIcon name="chat" color={colors.white} size={18} />
                        <Text style={styles.actionTxt}>Chat</Text>
                      </Pressable>
                      <Pressable style={[styles.actionBtn, styles.video, videoCall.isPending && { opacity: 0.6 }]} disabled={videoCall.isPending} onPress={() => videoCall.mutate(e.pet.owner.id)}>
                        <TabIcon name="video" color={colors.white} size={18} />
                        <Text style={styles.actionTxt}>{videoCall.isPending ? 'Llamando…' : 'Videollamada'}</Text>
                      </Pressable>
                    </View>
                    <Pressable style={[styles.finishBtn, finish.isPending && { opacity: 0.6 }]} disabled={finish.isPending} onPress={() => confirmFinish(e.id)}>
                      <Text style={styles.finishTxt}>{finish.isPending ? 'Finalizando…' : '✓ Finalizar consulta'}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={[styles.acceptBtn, accept.isPending && { opacity: 0.6 }]} disabled={accept.isPending} onPress={() => accept.mutate(a.id)}>
                    <Text style={styles.acceptTxt}>Aceptar y despachar</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  head: { padding: 20 },
  title: { fontSize: 24, fontWeight: '900', color: colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  icon: { fontSize: 40 },
  emptyTxt: { color: colors.muted, fontSize: 15, textAlign: 'center' },

  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 6, borderWidth: 2, boxShadow: cardShadow },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  badgeTxt: { color: colors.white, fontWeight: '800', fontSize: 12 },
  dist: { fontSize: 13, color: colors.muted, fontWeight: '700' },
  pet: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 4 },
  summary: { fontSize: 14, color: colors.text, lineHeight: 20 },
  firstAid: { fontSize: 13, color: colors.muted, lineHeight: 19 },

  acceptBtn: { backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  acceptTxt: { color: colors.white, fontWeight: '800', fontSize: 15 },

  acceptedBox: { backgroundColor: colors.brandLight, borderRadius: radius.md, padding: 12, gap: 4, marginTop: 8 },
  acceptedTitle: { fontSize: 14, fontWeight: '800', color: colors.green },
  ownerName: { fontSize: 16, fontWeight: '800', color: colors.text },
  med: { fontSize: 13, color: colors.muted },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', gap: 6, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  chat: { backgroundColor: colors.brandDark },
  video: { backgroundColor: colors.brand },
  actionTxt: { color: colors.white, fontWeight: '800', fontSize: 14 },
  finishBtn: { marginTop: 8, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: colors.green, backgroundColor: '#EAF7EE' },
  finishTxt: { color: colors.green, fontWeight: '800', fontSize: 14 },
});
