import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Card, Loading, Muted, Screen } from '../components/ui';
import { colors } from '../theme';

interface Pet {
  id: string;
  name: string;
  breed?: string;
  species: string;
  weightKg?: string;
}

export default function PetsScreen({ navigation }: { navigation: any }) {
  const pets = useQuery({ queryKey: ['pets'], queryFn: () => api<{ data: Pet[] }>('/me/pets') });

  if (pets.isLoading) return <Loading />;

  return (
    <Screen>
      <Text style={styles.title}>Mi Expediente</Text>
      <Muted>Las fichas médicas de tus mascotas.</Muted>

      {pets.data?.data.map((p) => (
        <Pressable key={p.id} onPress={() => navigation.navigate('PetDetail', { id: p.id, name: p.name })}>
          <Card style={styles.petCard}>
            <Text style={{ fontSize: 32 }}>{p.species === 'CAT' ? '🐈' : p.species === 'DOG' ? '🐕' : '🐾'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.petName}>{p.name}</Text>
              <Muted>{p.breed}{p.weightKg ? ` · ${p.weightKg} kg` : ''}</Muted>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Card>
        </Pressable>
      ))}

      {pets.data?.data.length === 0 && (
        <View style={styles.empty}>
          <Text style={{ fontSize: 40 }}>🐾</Text>
          <Muted>Aún no tienes mascotas registradas.</Muted>
        </View>
      )}

      <Pressable style={styles.addBtn} onPress={() => navigation.navigate('RegisterPet')}>
        <Text style={styles.addText}>+ Registrar mascota</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  petCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  petName: { fontSize: 17, fontWeight: '700', color: colors.text },
  chevron: { fontSize: 28, color: colors.muted },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  addBtn: { marginTop: 8, borderWidth: 1.5, borderColor: colors.brand, borderRadius: 999, paddingVertical: 15, alignItems: 'center', borderStyle: 'dashed' },
  addText: { color: colors.brand, fontWeight: '700', fontSize: 15 },
});
