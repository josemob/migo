import { useQuery } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { Badge, Card, Loading, Muted, Screen } from '../components/ui';
import { colors } from '../theme';

interface Ficha {
  name: string;
  breed?: string;
  bloodType?: string;
  weightKg?: string;
  allergies: { substance: string }[];
  conditions: { name: string }[];
  vaccinations: { vaccineName: string; nextDueAt?: string }[];
  prescriptions: { drug: string; frequency?: string }[];
  records: { id: string; visitedAt: string; reason?: string; clinic?: { name: string } }[];
}

export default function PetDetailScreen({ route }: { route: any }) {
  const { id } = route.params;
  const { data, isLoading } = useQuery({ queryKey: ['pet', id], queryFn: () => api<Ficha>(`/me/pets/${id}`) });

  if (isLoading || !data) return <Loading />;
  const upToDate = (d?: string) => !d || new Date(d) > new Date();

  return (
    <Screen>
      <Card style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ fontSize: 48 }}>🐕</Text>
        <Text style={styles.name}>{data.name}</Text>
        <Muted>{data.breed}{data.weightKg ? ` · ${data.weightKg} kg` : ''}{data.bloodType ? ` · ${data.bloodType}` : ''}</Muted>
      </Card>

      {data.allergies.length > 0 && (
        <Card>
          <Text style={styles.section}>Alergias conocidas</Text>
          <View style={styles.row}>
            {data.allergies.map((a, i) => (
              <Badge key={i} text={a.substance} color={colors.red} />
            ))}
          </View>
        </Card>
      )}

      {data.conditions.length > 0 && (
        <Card>
          <Text style={styles.section}>Preexistencias</Text>
          {data.conditions.map((c, i) => (
            <Text key={i} style={styles.item}>• {c.name}</Text>
          ))}
        </Card>
      )}

      <Card>
        <Text style={styles.section}>Esquema de vacunación</Text>
        {data.vaccinations.length === 0 && <Muted>Sin vacunas registradas.</Muted>}
        {data.vaccinations.map((v, i) => (
          <View key={i} style={styles.vaxRow}>
            <Text style={styles.item}>{v.vaccineName}</Text>
            <Badge text={upToDate(v.nextDueAt) ? 'Al día' : 'Vencida'} color={upToDate(v.nextDueAt) ? colors.green : colors.red} />
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.section}>Historial de visitas</Text>
        {data.records.length === 0 && <Muted>Sin visitas registradas.</Muted>}
        {data.records.map((r) => (
          <View key={r.id} style={styles.visit}>
            <Text style={styles.item}>{r.reason ?? 'Consulta'}</Text>
            <Muted>
              {new Date(r.visitedAt).toLocaleDateString('es-VE')} {r.clinic ? `· ${r.clinic.name}` : ''}
            </Muted>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 24, fontWeight: '800', color: colors.text },
  section: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { fontSize: 15, color: colors.text },
  vaxRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  visit: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
});
