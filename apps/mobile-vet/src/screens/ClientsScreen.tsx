import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { TabIcon } from '../components/TabIcon';
import { Loading } from '../components/ui';
import { cardShadow, colors, radius, type } from '../theme';

interface Pet {
  id: string;
  name: string;
  species?: string;
  breed?: string;
  owner?: { fullName: string; nationalId?: string | null; phone?: string | null } | null;
  records?: { visitedAt: string }[];
}

const BY = [
  { key: 'name', label: 'Nombre' },
  { key: 'nationalId', label: 'Cédula' },
  { key: 'microchip', label: 'Chip' },
] as const;

export default function ClientsScreen({ navigation }: { navigation: any }) {
  const [by, setBy] = useState<(typeof BY)[number]['key']>('name');
  const [q, setQ] = useState('');
  const term = q.trim();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['patients', by, term],
    queryFn: () => api<{ data: Pet[] }>(`/patients?by=${by}&search=${encodeURIComponent(term)}`),
    enabled: term.length >= 2,
  });
  const list = data?.data ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <Text style={styles.title}>Clientes & Pacientes</Text>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <View style={styles.searchBox}>
          <TabIcon name="person" color={colors.muted} size={18} />
          <TextInput
            style={styles.searchInput}
            placeholder={by === 'name' ? 'Buscar por nombre de mascota…' : by === 'nationalId' ? 'Cédula del dueño…' : 'N° de microchip…'}
            placeholderTextColor={colors.muted}
            value={q}
            onChangeText={setQ}
            autoCapitalize={by === 'nationalId' ? 'characters' : 'none'}
          />
        </View>
        <View style={styles.segs}>
          {BY.map((b) => (
            <Pressable key={b.key} style={[styles.seg, by === b.key && styles.segOn]} onPress={() => setBy(b.key)}>
              <Text style={[styles.segTxt, by === b.key && styles.segTxtOn]}>{b.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {term.length < 2 ? (
          <View style={styles.empty}><Text style={styles.emptyIcon}>🔎</Text><Text style={styles.emptyTxt}>Escribe al menos 2 caracteres para buscar.</Text></View>
        ) : isLoading || isFetching ? (
          <Loading />
        ) : list.length === 0 ? (
          <View style={styles.empty}><Text style={styles.emptyIcon}>🐾</Text><Text style={styles.emptyTxt}>Sin pacientes que coincidan.</Text></View>
        ) : (
          list.map((p) => (
            <Pressable key={p.id} style={styles.card} onPress={() => navigation.navigate('PatientDetail', { petId: p.id, name: p.name })}>
              <View style={styles.avatar}><Text style={{ fontSize: 22 }}>🐶</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.petName}>{p.name}</Text>
                <Text style={styles.petSub}>{[p.breed, p.species].filter(Boolean).join(' · ') || 'Paciente'}</Text>
                <Text style={styles.owner}>Dueño: {p.owner?.fullName ?? '—'}{p.owner?.nationalId ? ` · ${p.owner.nationalId}` : ''}</Text>
              </View>
              <TabIcon name="navigation" color={colors.brand} size={18} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  head: { paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontSize: 24, fontWeight: '900', color: colors.text },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 16, color: colors.text },
  segs: { flexDirection: 'row', gap: 8, marginTop: 12 },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  segOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  segTxt: { ...type.bodySmall, fontWeight: '700', color: colors.muted },
  segTxtOn: { color: colors.white },

  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, marginBottom: 12, boxShadow: cardShadow },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  petName: { fontSize: 17, fontWeight: '800', color: colors.text },
  petSub: { fontSize: 13, color: colors.muted, marginTop: 1 },
  owner: { fontSize: 13, color: colors.muted, marginTop: 2 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  emptyIcon: { fontSize: 40 },
  emptyTxt: { color: colors.muted, fontSize: 15, textAlign: 'center' },
});
