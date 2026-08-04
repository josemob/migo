import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { Button, Loading, Muted } from '../components/ui';
import { TabIcon } from '../components/TabIcon';
import { cardShadow, colors, radius } from '../theme';

interface Pet { id: string; name: string; breed?: string; species: string; photoUrl?: string }
interface Clinic {
  id: string;
  name: string;
  phone?: string;
  latitude?: string;
  longitude?: string;
  isOpen24_7: boolean;
  acceptsEmergencies: boolean;
  distanceKm?: number | null;
}

const FALLBACK = { lat: 10.4806, lng: -66.8564 };
const eta = (km?: number | null) => (km != null ? Math.max(1, Math.round((km / 25) * 60)) : null);
const call = (phone?: string) =>
  phone ? Linking.openURL(`tel:${phone.replace(/\s/g, '')}`) : appAlert('Sin teléfono', 'Esta clínica no tiene teléfono registrado.');

export default function EmergencyClinicsScreen({ navigation }: { navigation: any }) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [petId, setPetId] = useState<string | null>(null);
  const [symptoms, setSymptoms] = useState('');
  const [busy, setBusy] = useState(false);

  const pets = useQuery({ queryKey: ['pets'], queryFn: () => api<{ data: Pet[] }>('/me/pets') });

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({});
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        } else setCoords(FALLBACK);
      } catch {
        setCoords(FALLBACK);
      }
    })();
  }, []);

  // Preselecciona la mascota si solo hay una
  useEffect(() => {
    const list = pets.data?.data ?? [];
    if (list.length === 1 && !petId) setPetId(list[0]!.id);
  }, [pets.data, petId]);

  const clinics = useQuery({
    queryKey: ['emergency-clinics', coords],
    queryFn: () => api<{ data: Clinic[] }>(`/clinics?lat=${coords!.lat}&lng=${coords!.lng}`),
    enabled: !!coords,
  });

  if (pets.isLoading) return <Loading />;

  const petList = pets.data?.data ?? [];
  const nearby = [...(clinics.data?.data ?? [])]
    .filter((c) => c.acceptsEmergencies)
    .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
    .slice(0, 3);

  const submit = async () => {
    if (!petId) return appAlert('Falta la mascota', 'Selecciona a quién es la urgencia.');
    if (symptoms.trim().length < 3) return appAlert('Describe la afección', 'Cuéntanos brevemente qué está pasando.');
    setBusy(true);
    try {
      const loc = coords ?? FALLBACK;
      const res = await api<{ emergency: { id: string } }>('/emergencies', {
        method: 'POST',
        body: { petId, symptoms, latitude: loc.lat, longitude: loc.lng },
      });
      navigation.navigate('Tracking', { id: res.emergency.id });
    } catch (e) {
      appAlert('No se pudo enviar', e instanceof Error ? e.message : 'Intenta de nuevo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Activar Emergencia</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Muted>Selecciona la mascota y describe qué ocurre. Migo AI hará el triaje y alertará a las clínicas cercanas.</Muted>

        <Text style={styles.section}>Mascota</Text>
        {petList.length === 0 ? (
          <Muted>No tienes mascotas registradas.</Muted>
        ) : (
          <View style={{ gap: 8 }}>
            {petList.map((p) => (
              <Pressable key={p.id} onPress={() => setPetId(p.id)}>
                <View style={[styles.pet, petId === p.id && styles.petActive]}>
                  {p.photoUrl ? (
                    <Image source={{ uri: p.photoUrl }} style={styles.petImg} />
                  ) : (
                    <View style={[styles.petImg, styles.petImgPh]}>
                      <Text style={{ fontSize: 22 }}>{p.species === 'CAT' ? '🐈' : '🐕'}</Text>
                    </View>
                  )}
                  <View>
                    <Text style={styles.petName}>{p.name}</Text>
                    <Text style={styles.petBreed}>{p.breed}</Text>
                  </View>
                  {petId === p.id && <Text style={styles.check}>✓</Text>}
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.section}>¿Qué está pasando?</Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            placeholder="Ej. Dificultad para respirar, vómito, no responde…"
            placeholderTextColor={colors.muted}
            value={symptoms}
            onChangeText={setSymptoms}
            multiline
          />
        </View>

        <View style={{ marginTop: 18 }}>
          <Button title="Activar alerta de emergencia" onPress={submit} loading={busy} variant="danger" />
        </View>

        {/* Clínicas cercanas operativas */}
        <Text style={styles.section}>Clínicas cercanas operativas</Text>
        {clinics.isLoading ? (
          <Muted>Buscando clínicas cerca de ti…</Muted>
        ) : nearby.length === 0 ? (
          <Muted>No hay clínicas de urgencia cerca por ahora.</Muted>
        ) : (
          <View style={{ gap: 12 }}>
            {nearby.map((c) => (
              <View key={c.id} style={styles.clinicCard}>
                <View style={{ flex: 1 }}>
                  <View style={styles.clinicHead}>
                    <Text style={styles.clinicName} numberOfLines={1}>{c.name}</Text>
                    {c.isOpen24_7 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>24h</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.clinicMeta}>
                    {c.distanceKm != null ? `${c.distanceKm} km · ~${eta(c.distanceKm)} min` : 'Distancia n/d'}
                  </Text>
                </View>
                <Pressable style={styles.callBtn} onPress={() => call(c.phone)}>
                  <TabIcon name="phone" color={colors.white} size={16} />
                  <Text style={styles.callText}>Llamar</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: colors.text },

  section: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 22, marginBottom: 10 },

  pet: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, boxShadow: cardShadow },
  petActive: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  petImg: { width: 44, height: 44, borderRadius: 12 },
  petImgPh: { backgroundColor: '#EFE3F5', alignItems: 'center', justifyContent: 'center' },
  petName: { fontSize: 16, fontWeight: '800', color: colors.text },
  petBreed: { fontSize: 13, color: colors.muted },
  check: { marginLeft: 'auto', color: colors.brand, fontSize: 20, fontWeight: '900' },

  inputWrap: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, boxShadow: cardShadow },
  input: { padding: 16, fontSize: 16, color: colors.text, height: 100, textAlignVertical: 'top' },

  clinicCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, boxShadow: cardShadow },
  clinicHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clinicName: { fontSize: 16, fontWeight: '800', color: colors.text, flexShrink: 1 },
  badge: { backgroundColor: colors.brandLight, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: colors.brand, fontWeight: '800', fontSize: 11 },
  clinicMeta: { fontSize: 13, color: colors.muted, marginTop: 3 },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.brand, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  callText: { color: colors.white, fontWeight: '800', fontSize: 14 },
});
