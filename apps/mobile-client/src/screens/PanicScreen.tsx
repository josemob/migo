import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button, Input, Loading, Muted, Screen } from '../components/ui';
import { colors, radius } from '../theme';

interface Pet {
  id: string;
  name: string;
  breed?: string;
  species: string;
}

// Coordenadas por defecto (Caracas) si no hay permiso de ubicación / web
const FALLBACK = { latitude: 10.4806, longitude: -66.8564 };

export default function PanicScreen({ navigation }: { navigation: any }) {
  const [petId, setPetId] = useState<string | null>(null);
  const [symptoms, setSymptoms] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pets = useQuery({ queryKey: ['pets'], queryFn: () => api<{ data: Pet[] }>('/me/pets') });

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({});
          setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        } else {
          setCoords(FALLBACK);
        }
      } catch {
        setCoords(FALLBACK);
      } finally {
        setLocating(false);
      }
    })();
  }, []);

  const submit = async () => {
    if (!petId) return setError('Selecciona una mascota');
    if (symptoms.trim().length < 3) return setError('Describe brevemente los síntomas');
    setError('');
    setBusy(true);
    try {
      const loc = coords ?? FALLBACK;
      const res = await api<{ emergency: { id: string }; triage: unknown; broadcastedTo: number }>(
        '/emergencies',
        { method: 'POST', body: { petId, symptoms, latitude: loc.latitude, longitude: loc.longitude } },
      );
      navigation.replace('Tracking', { id: res.emergency.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar la alerta');
    } finally {
      setBusy(false);
    }
  };

  if (pets.isLoading) return <Loading />;

  return (
    <Screen>
      <Text style={styles.title}>Activar Emergencia</Text>
      <Muted>Selecciona la mascota y describe qué ocurre. Migo AI hará el triaje y alertará a las clínicas cercanas.</Muted>

      <Text style={styles.section}>Mascota</Text>
      <View style={{ gap: 8 }}>
        {pets.data?.data.map((p) => (
          <Pressable key={p.id} onPress={() => setPetId(p.id)}>
            <View style={[styles.pet, petId === p.id && styles.petActive]}>
              <Text style={{ fontSize: 24 }}>{p.species === 'CAT' ? '🐈' : '🐕'}</Text>
              <View>
                <Text style={styles.petName}>{p.name}</Text>
                <Text style={styles.petBreed}>{p.breed}</Text>
              </View>
            </View>
          </Pressable>
        ))}
        {pets.data?.data.length === 0 && <Muted>No tienes mascotas registradas aún.</Muted>}
      </View>

      <Text style={styles.section}>¿Qué está pasando?</Text>
      <Input
        placeholder="Ej. Dificultad para respirar, vómito, no responde…"
        value={symptoms}
        onChangeText={setSymptoms}
        multiline
      />

      <View style={styles.locRow}>
        <Text style={{ fontSize: 16 }}>📍</Text>
        <Muted>{locating ? 'Obteniendo tu ubicación…' : coords ? 'Ubicación lista' : 'Ubicación aproximada'}</Muted>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title="🚨 ENVIAR ALERTA DE EMERGENCIA" onPress={submit} variant="danger" loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  section: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 20, marginBottom: 8 },
  pet: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border,
  },
  petActive: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  petName: { fontSize: 16, fontWeight: '700', color: colors.text },
  petBreed: { fontSize: 13, color: colors.muted },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 12 },
  error: { color: colors.red, marginBottom: 8 },
});
