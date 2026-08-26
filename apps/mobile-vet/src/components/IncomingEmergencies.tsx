import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { useVetVideo } from '../lib/vetVideo';
import { requestCallPermissions } from '../lib/callPermissions';
import { TabIcon } from './TabIcon';
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
    latitude?: string | number | null;
    longitude?: string | number | null;
    pet: {
      name: string;
      breed?: string | null;
      species: string;
      owner: { id: string; fullName: string; phone?: string | null };
      allergies: { substance: string }[];
      conditions: { name: string }[];
    };
  };
}

/** Emergencias ruteadas al vet independiente (Fase C): listar + aceptar. Poll cada 15s. */
export function IncomingEmergencies() {
  const { client: videoClient } = useVetVideo();
  const [calling, setCalling] = useState(false);

  const q = useQuery({
    queryKey: ['my-emergencies'],
    queryFn: () => api<{ data: IncomingAlert[] }>('/me/emergencies'),
    refetchInterval: 15000,
  });

  // Inicia una videollamada al dueño: el servidor "anilla" a nombre del vet y la
  // llamada llega a este dispositivo por el overlay (useCalls). Pide permisos primero.
  const startVideoCall = async (emergencyId: string) => {
    if (!videoClient) {
      return appAlert('Video no disponible', 'Conectando el servicio de video… reintenta en unos segundos.');
    }
    const ok = await requestCallPermissions();
    if (!ok) {
      return appAlert('Permisos necesarios', 'Activa cámara y micrófono para hacer videollamadas.');
    }
    setCalling(true);
    try {
      await api(`/me/emergencies/${emergencyId}/call`, { method: 'POST' });
    } catch (e) {
      appAlert('No se pudo iniciar la llamada', e instanceof Error ? e.message : 'Intenta de nuevo.');
    } finally {
      setCalling(false);
    }
  };

  const openRoute = (lat?: string | number | null, lng?: string | number | null) => {
    if (lat == null || lng == null) return appAlert('Sin ubicación', 'Esta urgencia no tiene ubicación registrada.');
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() => {});
  };

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
                <View style={styles.actionRow}>
                  <Pressable style={[styles.actionBtn, styles.video, calling && { opacity: 0.6 }]} disabled={calling} onPress={() => startVideoCall(e.id)}>
                    <TabIcon name="video" color={colors.white} size={18} />
                    <Text style={styles.actionTxt}>{calling ? 'Llamando…' : 'Videollamada'}</Text>
                  </Pressable>
                  <Pressable style={[styles.actionBtn, styles.route]} onPress={() => openRoute(e.latitude, e.longitude)}>
                    <TabIcon name="navigation" color={colors.white} size={18} />
                    <Text style={styles.actionTxt}>Ver ruta</Text>
                  </Pressable>
                </View>
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
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', gap: 6, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  video: { backgroundColor: colors.brand },
  route: { backgroundColor: colors.green },
  actionTxt: { color: colors.white, fontWeight: '800', fontSize: 14 },
});
