import { useQuery } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { Badge, Button, Card, Loading, Muted, Screen } from '../components/ui';
import { colors, radius, triageColor, triageLabel } from '../theme';

interface Track {
  id: string;
  status: string;
  triageLevel?: string;
  aiSummary?: string;
  aiFirstAid?: string;
  symptoms?: string;
  pet: { name: string; breed?: string };
  acceptedClinic?: { name: string; phone?: string; address?: string } | null;
  alerts: { status: string; distanceKm?: number; etaMinutes?: number }[];
}

const statusText: Record<string, string> = {
  TRIAGING: 'Analizando síntomas con IA…',
  BROADCASTING: 'Alertando a clínicas cercanas…',
  ACCEPTED: '✅ Una clínica aceptó tu urgencia',
  EN_ROUTE: 'En camino a la clínica',
  ATTENDED: 'Paciente atendido',
  HOSPITALIZED: 'Paciente hospitalizado',
  EXPIRED: 'Ninguna clínica respondió a tiempo',
  CANCELLED: 'Urgencia cancelada',
};

export default function TrackingScreen({ route, navigation }: { route: any; navigation: any }) {
  const { id } = route.params;
  const { data, isLoading } = useQuery({
    queryKey: ['track', id],
    queryFn: () => api<Track>(`/emergencies/${id}/track`),
    refetchInterval: 5000,
  });

  if (isLoading || !data) return <Loading />;

  const accepted = data.acceptedClinic;
  const nearest = data.alerts.slice().sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99))[0];

  return (
    <Screen>
      {/* Nivel de triaje */}
      {data.triageLevel && (
        <View style={[styles.triage, { backgroundColor: triageColor[data.triageLevel] }]}>
          <Text style={styles.triageLabel}>NIVEL DE TRIAJE</Text>
          <Text style={styles.triageLevel}>{triageLabel[data.triageLevel]}</Text>
        </View>
      )}

      <Card>
        <Text style={styles.status}>{statusText[data.status] ?? data.status}</Text>
        <Muted>
          {data.pet.name} {data.pet.breed ? `· ${data.pet.breed}` : ''}
        </Muted>
      </Card>

      {data.aiSummary && (
        <Card>
          <Text style={styles.cardTitle}>🩺 Reporte de Migo AI</Text>
          <Text style={styles.body}>{data.aiSummary}</Text>
        </Card>
      )}

      {data.aiFirstAid && (
        <Card style={{ backgroundColor: '#FEF4E4', borderColor: colors.amber }}>
          <Text style={styles.cardTitle}>⚠️ Primeros auxilios</Text>
          <Text style={styles.body}>{data.aiFirstAid}</Text>
        </Card>
      )}

      {accepted ? (
        <Card style={{ borderColor: colors.green, borderWidth: 2 }}>
          <Badge text="CLÍNICA ASIGNADA" color={colors.green} />
          <Text style={[styles.cardTitle, { marginTop: 8 }]}>🏥 {accepted.name}</Text>
          {accepted.address && <Muted>{accepted.address}</Muted>}
          {nearest?.distanceKm != null && (
            <Text style={styles.eta}>
              📍 {nearest.distanceKm} km · ~{nearest.etaMinutes} min
            </Text>
          )}
          {accepted.phone && <Button title={`📞 Llamar a ${accepted.name}`} onPress={() => {}} variant="green" />}
        </Card>
      ) : (
        <Card>
          <Text style={styles.body}>
            {data.alerts.length > 0
              ? `Alertamos a ${data.alerts.length} clínica(s) cercana(s). Esperando confirmación…`
              : 'Buscando clínicas disponibles…'}
          </Text>
        </Card>
      )}

      <Button title="Volver al inicio" onPress={() => navigation.navigate('Inicio')} variant="outline" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  triage: { borderRadius: radius.lg, padding: 20, alignItems: 'center' },
  triageLabel: { color: '#ffffffcc', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  triageLevel: { color: colors.white, fontSize: 28, fontWeight: '800', marginTop: 4 },
  status: { fontSize: 17, fontWeight: '700', color: colors.text },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  eta: { fontSize: 15, fontWeight: '600', color: colors.text, marginVertical: 8 },
});
