import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { cardShadow, colors, radius, triageColor, triageLabel } from '../theme';

interface IncomingAlert {
  id: string; // id de la alerta
  distanceKm: string | number | null;
  etaMinutes: number | null;
  emergency: {
    id: string;
    symptoms: string | null;
    triageLevel: string | null;
    aiSummary: string | null;
    aiFirstAid: string | null;
    status: string;
    requiredSpecialty: string | null;
    pet: {
      name: string;
      breed?: string | null;
      species: string;
      owner: { fullName: string; phone?: string | null };
      allergies: { substance: string }[];
      conditions: { name: string }[];
    };
  };
}

/** Emergencias ruteadas al vet independiente (Fase C): listar + aceptar. Poll cada 15s. */
export function IncomingEmergencies() {
  const q = useQuery({
    queryKey: ['my-emergencies'],
    queryFn: () => api<{ data: IncomingAlert[] }>('/me/emergencies'),
    refetchInterval: 15000,
  });

  const accept = useMutation({
    mutationFn: (alertId: string) => api(`/me/emergencies/alerts/${alertId}/accept`, { method: 'POST' }),
    onSuccess: () => void q.refetch(),
    onError: (e) => appAlert('No se pudo aceptar', e instanceof Error ? e.message : 'Puede que otro profesional ya la haya tomado.'),
  });

  const alerts = q.data?.data ?? [];
  if (alerts.length === 0) return null; // sin emergencias -> no ocupa espacio

  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.header}>🚨 Emergencias cercanas ({alerts.length})</Text>
      {alerts.map((a) => {
        const e = a.emergency;
        const level = e.triageLevel ?? 'ORANGE';
        const tc = triageColor[level] ?? colors.amber;
        const mine = e.status === 'ACCEPTED'; // en mi lista + aceptada = la acepté yo
        const km = a.distanceKm != null ? `${Number(a.distanceKm).toFixed(1)} km` : null;
        const phone = e.pet.owner.phone;
        return (
          <View key={a.id} style={[styles.card, { borderColor: tc }]}>
            <View style={styles.top}>
              <View style={[styles.badge, { backgroundColor: tc }]}>
                <Text style={styles.badgeTxt}>{triageLabel[level] ?? level}</Text>
              </View>
              {km && <Text style={styles.dist}>{km}{a.etaMinutes ? ` · ~${a.etaMinutes} min` : ''}</Text>}
            </View>

            <Text style={styles.pet}>{e.pet.name}{e.pet.breed ? ` · ${e.pet.breed}` : ''}</Text>
            <Text style={styles.summary}>{e.aiSummary || e.symptoms}</Text>
            {e.requiredSpecialty && <Text style={styles.spec}>Especialidad sugerida: {e.requiredSpecialty}</Text>}
            {e.aiFirstAid && <Text style={styles.firstAid}>Primeros auxilios: {e.aiFirstAid}</Text>}

            {mine ? (
              <View style={styles.acceptedBox}>
                <Text style={styles.acceptedTitle}>✅ Aceptada · contacto del dueño</Text>
                <Text style={styles.ownerName}>{e.pet.owner.fullName}</Text>
                {e.pet.allergies.length > 0 && (
                  <Text style={styles.med}>Alergias: {e.pet.allergies.map((x) => x.substance).join(', ')}</Text>
                )}
                {e.pet.conditions.length > 0 && (
                  <Text style={styles.med}>Condiciones: {e.pet.conditions.map((x) => x.name).join(', ')}</Text>
                )}
                {phone ? (
                  <Pressable style={styles.callBtn} onPress={() => Linking.openURL(`tel:${phone}`)}>
                    <Text style={styles.callTxt}>📞 Llamar al dueño ({phone})</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.med}>El dueño no tiene teléfono registrado.</Text>
                )}
              </View>
            ) : (
              <Pressable
                style={[styles.acceptBtn, accept.isPending && { opacity: 0.6 }]}
                disabled={accept.isPending}
                onPress={() => accept.mutate(a.id)}
              >
                <Text style={styles.acceptTxt}>Aceptar urgencia</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 16, fontWeight: '800', color: colors.text },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 6, borderWidth: 2, boxShadow: cardShadow },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  badgeTxt: { color: colors.white, fontWeight: '800', fontSize: 12 },
  dist: { fontSize: 13, color: colors.muted, fontWeight: '700' },
  pet: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 4 },
  summary: { fontSize: 14, color: colors.text, lineHeight: 20 },
  spec: { fontSize: 13, color: colors.brand, fontWeight: '700' },
  firstAid: { fontSize: 13, color: colors.muted, lineHeight: 19 },

  acceptBtn: { backgroundColor: colors.red, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  acceptTxt: { color: colors.white, fontWeight: '800', fontSize: 15 },

  acceptedBox: { backgroundColor: colors.brandLight, borderRadius: radius.md, padding: 12, gap: 4, marginTop: 8 },
  acceptedTitle: { fontSize: 14, fontWeight: '800', color: colors.green },
  ownerName: { fontSize: 16, fontWeight: '800', color: colors.text },
  med: { fontSize: 13, color: colors.muted },
  callBtn: { backgroundColor: colors.green, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  callTxt: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
