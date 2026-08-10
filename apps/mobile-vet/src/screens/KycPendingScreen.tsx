import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Loading } from '../components/ui';
import { cardShadow, colors, radius } from '../theme';

export interface Kyc {
  status: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  requestedPosition: string;
  reviewNotes?: string | null;
}

interface Invitation {
  id: string;
  position: string;
  clinic: { name: string; city?: string | null; logoUrl?: string | null } | null;
}

const POSITION_LABEL: Record<string, string> = {
  VET: 'Veterinario/a',
  GROOMER: 'Peluquero / Estética',
  RECEPTIONIST: 'Recepción',
  SUPPORT: 'Personal de apoyo',
  BRANCH_ADMIN: 'Admin de sucursal',
};

export default function KycPendingScreen({ kyc, onRetry, onRefresh }: { kyc: Kyc; onRetry: () => void; onRefresh: () => void }) {
  const { user, logout, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();

  const invites = useQuery({
    queryKey: ['my-invitations'],
    queryFn: () => api<{ data: Invitation[] }>('/staff-kyc/invitations'),
    enabled: kyc.status === 'APPROVED',
    refetchInterval: kyc.status === 'APPROVED' ? 15000 : false,
  });

  const respond = useMutation({
    mutationFn: (v: { id: string; accept: boolean }) => api(`/staff-kyc/invitations/${v.id}/respond`, { method: 'POST', body: { accept: v.accept } }),
    onSuccess: async (_r, v) => {
      if (v.accept) {
        await refreshUser(); // trae el nuevo staffProfile (clínica/especialidad) al usuario
        onRefresh(); // ya tiene clínica -> el gate lo lleva al dashboard
      } else {
        invites.refetch();
      }
    },
  });

  const pending = invites.data?.data ?? [];

  const view =
    kyc.status === 'APPROVED'
      ? { icon: '✅', color: colors.green, title: '¡Identidad verificada!' }
      : kyc.status === 'REJECTED'
      ? { icon: '⚠️', color: colors.red, title: 'Verificación rechazada' }
      : { icon: '⏳', color: colors.amber, title: 'En revisión' };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <Text style={styles.brand}>Migo <Text style={styles.brandVet}>VET</Text></Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 32, flexGrow: 1, justifyContent: 'center' }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={[styles.iconWrap, { backgroundColor: view.color + '22' }]}><Text style={{ fontSize: 44 }}>{view.icon}</Text></View>
          <Text style={[styles.title, { color: view.color }]}>{view.title}</Text>

          {kyc.status === 'REJECTED' && <Text style={styles.body}>{kyc.reviewNotes || 'No pudimos validar tus datos. Puedes reintentar con fotos más claras.'}</Text>}
          {(kyc.status === 'PENDING' || kyc.status === 'UNDER_REVIEW') && <Text style={styles.body}>Estamos verificando tu identidad y credenciales. Te avisaremos apenas esté lista.</Text>}
        </View>

        {/* Estado verificado + invitaciones */}
        {kyc.status === 'APPROVED' && (
          <View style={{ marginTop: 8 }}>
            {invites.isLoading ? (
              <Loading />
            ) : pending.length === 0 ? (
              <View style={styles.waitBox}>
                <Text style={styles.waitTxt}>Eres profesional verificado como <Text style={{ fontWeight: '800' }}>{POSITION_LABEL[kyc.requestedPosition] ?? 'personal'}</Text>. Una clínica te agregará por tu cédula.</Text>
                {user?.nationalId && (
                  <View style={styles.cedulaBox}><Text style={styles.cedulaLabel}>Tu cédula</Text><Text style={styles.cedula}>{user.nationalId}</Text></View>
                )}
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                <Text style={styles.invHeader}>Invitaciones de clínicas ({pending.length})</Text>
                {pending.map((inv) => (
                  <View key={inv.id} style={styles.invCard}>
                    <Text style={styles.invClinic}>{inv.clinic?.name ?? 'Una clínica'}</Text>
                    <Text style={styles.invSub}>Te invita como <Text style={{ fontWeight: '700', color: colors.brand }}>{POSITION_LABEL[inv.position] ?? inv.position}</Text>{inv.clinic?.city ? ` · ${inv.clinic.city}` : ''}</Text>
                    <View style={styles.invBtns}>
                      <Pressable style={[styles.invBtn, styles.invReject]} disabled={respond.isPending} onPress={() => respond.mutate({ id: inv.id, accept: false })}>
                        <Text style={styles.invRejectTxt}>Rechazar</Text>
                      </Pressable>
                      <Pressable style={[styles.invBtn, styles.invAccept]} disabled={respond.isPending} onPress={() => respond.mutate({ id: inv.id, accept: true })}>
                        <Text style={styles.invAcceptTxt}>Aceptar</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        {kyc.status === 'REJECTED' && <Button title="Reintentar verificación" onPress={onRetry} />}
        {kyc.status !== 'REJECTED' && <Button title="Actualizar" variant="outline" onPress={() => { onRefresh(); invites.refetch(); }} />}
        <Button title="Cerrar sesión" variant="outline" onPress={logout} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  head: { alignItems: 'center', paddingVertical: 16 },
  brand: { fontSize: 24, fontWeight: '900', color: colors.brand },
  brandVet: { fontSize: 14 },
  hero: { alignItems: 'center', gap: 12 },
  iconWrap: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  body: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 22, paddingHorizontal: 12 },

  waitBox: { alignItems: 'center', gap: 12, marginTop: 6 },
  waitTxt: { fontSize: 15, color: colors.muted, textAlign: 'center', lineHeight: 22 },
  cedulaBox: { backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: 28, paddingVertical: 16, alignItems: 'center', boxShadow: cardShadow },
  cedulaLabel: { fontSize: 12, color: colors.muted, fontWeight: '700', textTransform: 'uppercase' },
  cedula: { fontSize: 22, fontWeight: '900', color: colors.text, marginTop: 4, letterSpacing: 1 },

  invHeader: { fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 6 },
  invCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18, gap: 4, boxShadow: cardShadow, borderWidth: 2, borderColor: colors.brandLight },
  invClinic: { fontSize: 18, fontWeight: '800', color: colors.text },
  invSub: { fontSize: 14, color: colors.muted },
  invBtns: { flexDirection: 'row', gap: 10, marginTop: 12 },
  invBtn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md },
  invReject: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border },
  invRejectTxt: { color: colors.muted, fontWeight: '800', fontSize: 15 },
  invAccept: { backgroundColor: colors.brand },
  invAcceptTxt: { color: colors.white, fontWeight: '800', fontSize: 15 },

  actions: { padding: 24, gap: 12 },
});
