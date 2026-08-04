import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Loading, Muted } from '../components/ui';
import { TabIcon } from '../components/TabIcon';
import { SERVICE_CATEGORIES, categoryMeta } from '../lib/serviceCategories';
import { cardShadow, colors, radius } from '../theme';

interface Clinic {
  id: string;
  name: string;
  address?: string;
  city?: string;
  phone?: string;
  logoUrl?: string;
  distanceKm?: number | null;
  isOpen24_7: boolean;
  acceptsEmergencies: boolean;
  ratingAvg: string;
  ratingCount: number;
  plan: string;
  fromPriceUsd?: number | null;
  categories?: string[];
  organization?: { name: string };
}

export default function DirectoryScreen({ navigation, route }: any) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  // Filtro por categoría: puede venir de Home (route.params.category) o de los chips
  const [category, setCategory] = useState<string | null>(route?.params?.category ?? null);

  // Cuando Home navega con una categoría, sincroniza el filtro
  useEffect(() => {
    setCategory(route?.params?.category ?? null);
  }, [route?.params?.category]);

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

  const params = new URLSearchParams();
  if (coords) {
    params.set('lat', String(coords.lat));
    params.set('lng', String(coords.lng));
  }
  if (category) params.set('category', category);
  const qs = params.toString();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['clinics', coords, category],
    queryFn: () => api<{ data: Clinic[] }>(`/clinics${qs ? `?${qs}` : ''}`),
  });

  const meta = categoryMeta(category);
  const title = meta ? meta.title : 'Directorio';
  const subtitle = meta
    ? `Solo clínicas que ofrecen ${meta.label.toLowerCase()}`
    : 'Todas las clínicas verificadas cerca de ti';

  const clinics = data?.data ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      {/* Chips de categorías (Todos + cada servicio) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={{ flexGrow: 0 }}
      >
        <Chip label="Todos" icon="paw" active={!category} onPress={() => setCategory(null)} />
        {SERVICE_CATEGORIES.map((c) => (
          <Chip
            key={c.key}
            label={c.label}
            icon={c.icon}
            active={category === c.key}
            onPress={() => setCategory(category === c.key ? null : c.key)}
          />
        ))}
      </ScrollView>

      {isLoading ? (
        <Loading />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 6, paddingBottom: 40, gap: 14 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.resultsLabel}>
            {clinics.length > 0 ? 'Resultados más cercanos a ti' : ''}
            {isFetching && !isLoading ? '  ·  actualizando…' : ''}
          </Text>

          {clinics.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🔎</Text>
              <Text style={styles.emptyTitle}>Sin resultados</Text>
              <Muted>
                {meta
                  ? `Ninguna clínica cercana ofrece ${meta.label.toLowerCase()} por ahora.`
                  : 'No hay clínicas verificadas por ahora.'}
              </Muted>
            </View>
          ) : (
            clinics.map((c) => (
              <Pressable
                key={c.id}
                style={styles.card}
                onPress={() => navigation.navigate('ClinicDetail', { id: c.id, name: c.name, distanceKm: c.distanceKm })}
              >
                {c.logoUrl ? (
                  <Image source={{ uri: c.logoUrl }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbPh]}>
                    <TabIcon name="medical" color={colors.brand} size={26} />
                  </View>
                )}

                <View style={{ flex: 1 }}>
                  <View style={styles.cardTop}>
                    <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                    {c.plan === 'PRO' && (
                      <View style={styles.pro}>
                        <Text style={styles.proText}>PRO</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.ratingRow}>
                    <Text style={styles.star}>★</Text>
                    <Text style={styles.rating}>{Number(c.ratingAvg).toFixed(1)}</Text>
                    <Text style={styles.ratingCount}>({c.ratingCount} opiniones)</Text>
                  </View>

                  <Text style={styles.meta} numberOfLines={1}>
                    📍 {c.address ?? c.city ?? 'Caracas'}
                    {c.distanceKm != null ? `  ·  A ${c.distanceKm} km` : ''}
                  </Text>

                  <View style={styles.tagRow}>
                    {c.fromPriceUsd != null && (
                      <Text style={styles.price}>💰 Servicio base: Desde ${c.fromPriceUsd}</Text>
                    )}
                  </View>

                  <View style={styles.badgeRow}>
                    {c.isOpen24_7 && <Tag text="24/7" color={colors.green} />}
                    {c.acceptsEmergencies && <Tag text="Urgencias" color={colors.red} />}
                  </View>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Chip({ label, icon, active, onPress }: { label: string; icon: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <TabIcon name={icon} color={active ? colors.white : colors.brand} size={16} />
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Tag({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: color + '22' }]}>
      <Text style={[styles.tagText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 2 },

  chips: { paddingHorizontal: 20, paddingVertical: 10, gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.full,
    backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.brand,
  },
  chipActive: { backgroundColor: colors.brand },
  chipText: { color: colors.brand, fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: colors.white },

  resultsLabel: { fontSize: 15, fontWeight: '700', color: colors.text },

  card: { flexDirection: 'row', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: 12, boxShadow: cardShadow },
  thumb: { width: 84, height: 84, borderRadius: 14, backgroundColor: colors.brandLight },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '800', color: colors.text, flexShrink: 1 },
  pro: { backgroundColor: colors.brandLight, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  proText: { color: colors.brand, fontWeight: '800', fontSize: 11 },

  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  star: { color: colors.accent, fontSize: 14 },
  rating: { fontWeight: '800', color: colors.text, fontSize: 14 },
  ratingCount: { color: colors.muted, fontSize: 13 },

  meta: { fontSize: 13, color: colors.muted, marginTop: 4 },
  tagRow: { marginTop: 4 },
  price: { fontSize: 13, fontWeight: '700', color: colors.brand },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  tagText: { fontSize: 11, fontWeight: '700' },

  empty: { alignItems: 'center', gap: 6, paddingVertical: 50 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
});
