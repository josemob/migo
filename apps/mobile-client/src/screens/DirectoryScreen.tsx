import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Badge, Card, Loading, Muted, Screen } from '../components/ui';
import { colors } from '../theme';

interface Clinic {
  id: string;
  name: string;
  address?: string;
  city?: string;
  distanceKm?: number | null;
  isOpen24_7: boolean;
  acceptsEmergencies: boolean;
  ratingAvg: string;
  plan: string;
  organization?: { name: string };
}

export default function DirectoryScreen() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({});
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      } catch {
        /* sin ubicación: se listan sin distancia */
      }
    })();
  }, []);

  const q = coords ? `?lat=${coords.lat}&lng=${coords.lng}` : '';
  const { data, isLoading } = useQuery({
    queryKey: ['clinics', coords],
    queryFn: () => api<{ data: Clinic[] }>(`/clinics${q}`),
  });

  if (isLoading) return <Loading />;

  return (
    <Screen>
      <Text style={styles.title}>Clínicas cerca de ti</Text>
      {data?.data.map((c) => (
        <Card key={c.id} style={{ gap: 6 }}>
          <View style={styles.header}>
            <Text style={styles.name}>{c.name}</Text>
            {c.plan === 'PRO' && <Badge text="PRO" color={colors.brand} />}
          </View>
          <Muted>{c.organization?.name} · {c.address ?? c.city}</Muted>
          <View style={styles.tags}>
            {c.distanceKm != null && <Badge text={`📍 ${c.distanceKm} km`} color={colors.brand} />}
            {c.isOpen24_7 && <Badge text="24/7" color={colors.green} />}
            {c.acceptsEmergencies && <Badge text="Urgencias" color={colors.red} />}
            <Badge text={`★ ${Number(c.ratingAvg).toFixed(1)}`} color={colors.amber} />
          </View>
        </Card>
      ))}
      {data?.data.length === 0 && <Muted>No hay clínicas verificadas por ahora.</Muted>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 17, fontWeight: '700', color: colors.text },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
