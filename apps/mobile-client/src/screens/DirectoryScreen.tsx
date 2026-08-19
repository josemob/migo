import { useEffect, useState } from 'react';
import { Dimensions, Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Map as MapLibreMap, Camera, Marker as MapMarker } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Loading, Muted } from '../components/ui';
import { TabIcon } from '../components/TabIcon';
import { BackButton } from '../components/BackButton';
import { SERVICE_CATEGORIES, categoryMeta } from '../lib/serviceCategories';
import { cardShadow, colors, control, radius, type } from '../theme';

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const DEFAULT_CENTER: [number, number] = [-66.9036, 10.4806]; // Caracas
const { width: W, height: H } = Dimensions.get('window');
const MAP_H = Math.round(H * 0.3);

// Calcula centro + zoom que encuadra un conjunto de coordenadas [lng, lat]
// dentro del viewport del mapa (con margen). Estándar tipo Google fitBounds.
function fitBounds(coords: [number, number][]): { center: [number, number]; zoom: number } {
  if (coords.length === 0) return { center: DEFAULT_CENTER, zoom: 12 };
  if (coords.length === 1) return { center: coords[0], zoom: 14.5 };
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
  const center: [number, number] = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
  const latRad = (lat: number) => { const s = Math.sin((lat * Math.PI) / 180); return Math.log((1 + s) / (1 - s)) / 2; };
  const latFraction = Math.abs(latRad(maxLat) - latRad(minLat)) / Math.PI;
  const lngDiff = maxLng - minLng;
  const lngFraction = (lngDiff < 0 ? lngDiff + 360 : lngDiff) / 360;
  const PAD = 1.4; // margen alrededor de los pines
  const zoomFor = (px: number, frac: number) => Math.log2(px / 256 / Math.max(frac, 1e-9) / PAD);
  const zoom = Math.min(zoomFor(MAP_H, latFraction), zoomFor(W, lngFraction), 15.5);
  return { center, zoom: Math.max(3, zoom) };
}

interface Clinic {
  id: string;
  name: string;
  address?: string;
  city?: string;
  phone?: string;
  logoUrl?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  distanceKm?: number | null;
  isOpen24_7: boolean;
  openNow?: boolean | null; // true=abierto, false=cerrado, null=sin horario cargado
  closesAt?: string | null; // "20:00" si está abierto
  opensAt?: string | null; // "08:00" próxima apertura si está cerrado
  acceptsEmergencies: boolean;
  ratingAvg: string;
  ratingCount: number;
  plan: string;
  sponsored?: boolean; // patrocinada y el usuario está dentro del radio -> badge "Patrocinado"
  fromPriceUsd?: number | null;
  categories?: string[];
  organization?: { name: string };
}

export default function DirectoryScreen({ navigation, route }: any) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [category, setCategory] = useState<string | null>(route?.params?.category ?? null);

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
  const clinics = data?.data ?? [];
  const pins = clinics.filter((c) => c.latitude != null && c.longitude != null);
  // Encuadra al menos las 3 clínicas más cercanas (la API ya las devuelve ordenadas por distancia).
  const nearest3 = pins.slice(0, 3).map((c) => [Number(c.longitude), Number(c.latitude)] as [number, number]);
  const { center, zoom } = nearest3.length
    ? fitBounds(nearest3)
    : coords
    ? { center: [coords.lng, coords.lat] as [number, number], zoom: 13 }
    : { center: DEFAULT_CENTER, zoom: 12 };

  const share = () => Share.share({ message: `Encontré clínicas para mascotas cerca de mí en Migo 🐾 (${title})` }).catch(() => {});
  const goClinic = (c: Clinic) => navigation.navigate('ClinicDetail', { id: c.id, name: c.name, distanceKm: c.distanceKm });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <BackButton onPress={() => navigation.navigate('Home')} />
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <Pressable style={styles.shareBtn} hitSlop={8} onPress={share}>
          <TabIcon name="share" color={colors.brand} size={22} />
        </Pressable>
      </View>

      {/* Mapa con pines */}
      <View style={styles.map}>
        <MapLibreMap style={StyleSheet.absoluteFill} mapStyle={OPENFREEMAP_STYLE}>
          {/* key = centro+zoom: recentra y reajusta el encuadre al cambiar de categoría/resultados */}
          <Camera key={`${center[0].toFixed(3)}_${center[1].toFixed(3)}_${zoom.toFixed(2)}`} initialViewState={{ center, zoom }} />
          {coords && (
            <MapMarker id="me" lngLat={[coords.lng, coords.lat]}>
              <View style={styles.meDotOuter}>
                <View style={styles.meDot} />
              </View>
            </MapMarker>
          )}
          {pins.map((c, i) => (
            <MapMarker key={c.id} id={`c-${c.id}`} lngLat={[Number(c.longitude), Number(c.latitude)]}>
              <Pressable style={styles.pinWrap} onPress={() => goClinic(c)}>
                <View style={styles.pinLabel}>
                  <Text style={styles.pinLabelText} numberOfLines={1}>{c.name}</Text>
                </View>
                <View style={[styles.pinDot, { borderColor: i % 2 === 0 ? colors.brand : colors.accent }]}>
                  <View style={[styles.pinDotInner, { backgroundColor: i % 2 === 0 ? colors.brand : colors.accent }]} />
                </View>
              </Pressable>
            </MapMarker>
          ))}
        </MapLibreMap>
      </View>

      {/* Sheet de resultados */}
      <View style={styles.sheet}>
        {isLoading ? (
          <Loading />
        ) : (
          <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 18, paddingBottom: 40, gap: 14 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.resultsLabel}>
              {clinics.length > 0 ? 'Resultados más cercanos a ti' : 'Directorio'}
              {isFetching && !isLoading ? '  ·  actualizando…' : ''}
            </Text>

            {/* Chips de categoría (filtro) */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0, marginHorizontal: -20, paddingHorizontal: 20 }}>
              <Chip label="Todos" icon="paw" active={!category} onPress={() => setCategory(null)} />
              {SERVICE_CATEGORIES.map((c) => (
                <Chip key={c.key} label={c.label} icon={c.icon} active={category === c.key} onPress={() => setCategory(category === c.key ? null : c.key)} />
              ))}
            </ScrollView>

            {clinics.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>🔎</Text>
                <Text style={styles.emptyTitle}>Sin resultados</Text>
                <Muted>
                  {meta ? `Ninguna clínica cercana ofrece ${meta.label.toLowerCase()} por ahora.` : 'No hay clínicas verificadas por ahora.'}
                </Muted>
              </View>
            ) : (
              clinics.map((c) => (
                <Pressable key={c.id} style={styles.card} onPress={() => goClinic(c)}>
                  {c.logoUrl ? (
                    <Image source={{ uri: c.logoUrl }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbPh]}>
                      <TabIcon name="medical" color={colors.brand} size={26} />
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    {c.sponsored && (
                      <View style={styles.sponsoredChip}>
                        <Text style={styles.sponsoredChipTxt}>★ Patrocinado</Text>
                      </View>
                    )}
                    <View style={styles.cardTop}>
                      <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                      <Pressable style={styles.verBtn} onPress={() => goClinic(c)}>
                        <Text style={styles.verBtnText}>Ver Horarios</Text>
                      </Pressable>
                    </View>

                    <View style={styles.ratingRow}>
                      <Text style={styles.star}>★</Text>
                      <Text style={styles.rating}>{Number(c.ratingAvg).toFixed(1)}</Text>
                      <Text style={styles.ratingCount}>({c.ratingCount} opiniones)</Text>
                    </View>

                    {c.openNow != null && (
                      <View style={[styles.statusPill, c.openNow ? styles.statusOpen : styles.statusClosed]}>
                        <View style={[styles.statusDot, { backgroundColor: c.openNow ? colors.green : colors.red }]} />
                        <Text style={[styles.statusText, { color: c.openNow ? colors.green : colors.red }]} numberOfLines={1}>
                          {c.openNow
                            ? c.closesAt
                              ? `Abierto · cierra ${c.closesAt}`
                              : 'Abierto 24 h'
                            : c.opensAt
                            ? `Cerrado · abre ${c.opensAt}`
                            : 'Cerrado'}
                        </Text>
                      </View>
                    )}

                    <Text style={styles.meta} numberOfLines={1}>
                      📍 {c.address ?? c.city ?? 'Caracas'}
                      {c.distanceKm != null ? `  ·  A ${c.distanceKm} km` : ''}
                    </Text>

                    {c.fromPriceUsd != null && (
                      <Text style={styles.price}>💰 Servicio base: Desde ${c.fromPriceUsd}</Text>
                    )}
                  </View>
                </Pressable>
              ))
            )}
          </ScrollView>
        )}
      </View>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', boxShadow: cardShadow },
  backArrow: { fontSize: 22, color: colors.brand, fontWeight: '700' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '800', color: colors.text },
  shareBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  map: { height: MAP_H, backgroundColor: colors.canvas, overflow: 'hidden' },

  meDotOuter: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(59,130,246,0.25)', alignItems: 'center', justifyContent: 'center' },
  meDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#2F76F6', borderWidth: 2, borderColor: colors.white },

  pinWrap: { alignItems: 'center' },
  pinLabel: { backgroundColor: colors.white, borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 3, maxWidth: 130, borderWidth: 1, borderColor: colors.brand, boxShadow: cardShadow },
  pinLabelText: { ...type.bodySmall, color: colors.brand, fontWeight: '600' },
  // Pin circular (sin transform: los marcadores de MapLibre no renderizan con rotate)
  pinDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.white, borderWidth: 3, alignItems: 'center', justifyContent: 'center', boxShadow: cardShadow },
  pinDotInner: { width: 12, height: 12, borderRadius: 6 },

  // Sheet superpuesto al mapa
  sheet: { flex: 1, backgroundColor: colors.canvas, borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -26, overflow: 'hidden' },

  resultsLabel: { fontSize: 20, fontWeight: '900', color: colors.text },

  // Chips con estructura de pill (24/4 · radio 27 · body small) SIN borde morado
  chips: { paddingVertical: 2, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: control.pill.paddingH, paddingVertical: control.pill.paddingV, borderRadius: control.pill.radius, backgroundColor: colors.white, boxShadow: cardShadow },
  chipActive: { backgroundColor: colors.brand },
  chipText: { ...type.bodySmall, color: colors.brand },
  chipTextActive: { color: colors.white },

  card: { flexDirection: 'row', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, padding: 12, boxShadow: cardShadow },
  thumb: { width: 84, height: 84, borderRadius: 14, backgroundColor: colors.brandLight },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  sponsoredChip: { alignSelf: 'flex-start', flexDirection: 'row', backgroundColor: '#FDF3D6', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 5 },
  sponsoredChipTxt: { color: '#B7791F', fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 16, fontWeight: '800', color: colors.text, flexShrink: 1 },

  // Ver Horarios: pill blanco (24/4 · radio 27 · body small) con borde 1px morado
  verBtn: { borderWidth: 1, borderColor: colors.brand, borderRadius: control.pill.radius, paddingHorizontal: control.pill.paddingH, paddingVertical: control.pill.paddingV, backgroundColor: colors.white },
  verBtnText: { ...type.bodySmall, color: colors.brand },

  // Badge Abierto/Cerrado (informativo — el agendamiento sigue disponible aunque esté cerrado)
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: control.pill.paddingH, paddingVertical: 3, borderRadius: radius.full },
  statusOpen: { backgroundColor: '#E7F6EC' },
  statusClosed: { backgroundColor: '#FDECEC' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { ...type.bodySmall, fontWeight: '600' },

  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  star: { color: colors.accent, fontSize: 14 },
  rating: { fontWeight: '800', color: colors.text, fontSize: 14 },
  ratingCount: { color: colors.muted, fontSize: 13 },

  meta: { fontSize: 13, color: colors.muted, marginTop: 4 },
  price: { fontSize: 13, fontWeight: '700', color: colors.brand, marginTop: 4 },

  empty: { alignItems: 'center', gap: 6, paddingVertical: 50 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
});
