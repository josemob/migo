import { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Map as MapLibreMap, Camera, Marker as MapMarker } from '@maplibre/maplibre-react-native';

// OpenFreeMap: tiles vectoriales gratis, SIN API key ni facturación (vía MapLibre).
const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { Loading, Muted } from '../components/ui';
import { TabIcon } from '../components/TabIcon';
import { categoryMeta } from '../lib/serviceCategories';
import { BackButton } from '../components/BackButton';
import { cardShadow, colors, radius } from '../theme';

interface Service { id: string; name: string; category: string; description?: string; priceUsd: string; durationMin: number }
interface Hours { id: string; dayOfWeek: number; opensAt: string; closesAt: string; isOpen: boolean; isOnCall: boolean }
interface Review { rating: number; comment?: string; createdAt: string; author?: { fullName: string } }
interface ClinicDetail {
  id: string;
  name: string;
  description?: string;
  address?: string;
  city?: string;
  phone?: string;
  logoUrl?: string;
  latitude?: string | null;
  longitude?: string | null;
  isOpen24_7: boolean;
  acceptsEmergencies: boolean;
  ratingAvg: string;
  ratingCount: number;
  organization?: { name: string };
  hours: Hours[];
  services: Service[];
  reviews: Review[];
}

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
type TabKey = 'info' | 'services' | 'reviews';

export default function ClinicDetailScreen({ navigation, route }: any) {
  const { id, distanceKm } = route.params as { id: string; name?: string; distanceKm?: number | null };
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>('info');

  const { data: clinic, isLoading } = useQuery({
    queryKey: ['clinic', id],
    queryFn: () => api<ClinicDetail>(`/clinics/${id}`),
  });

  if (isLoading || !clinic) return <Loading />;

  const call = () =>
    clinic.phone
      ? Linking.openURL(`tel:${clinic.phone.replace(/\s/g, '')}`)
      : appAlert('Sin teléfono', 'Esta clínica no tiene teléfono registrado.');

  const book = (svc: Service) =>
    navigation.navigate('BookAppointment', {
      clinicId: clinic.id,
      clinicName: clinic.name,
      service: { id: svc.id, name: svc.name, category: svc.category, priceUsd: svc.priceUsd, durationMin: svc.durationMin },
    });

  const directions = () => {
    const dest =
      clinic.latitude && clinic.longitude
        ? `${clinic.latitude},${clinic.longitude}`
        : encodeURIComponent(`${clinic.name} ${clinic.address ?? clinic.city ?? 'Caracas'}`);
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}`);
  };

  const openChat = () => navigation.navigate('ClinicChat', { clinicId: clinic.id, clinicName: clinic.name });

  const lat = Number(clinic.latitude);
  const lng = Number(clinic.longitude);
  const hasCoords = clinic.latitude != null && clinic.longitude != null && !Number.isNaN(lat) && !Number.isNaN(lng);
  const showMap = hasCoords;

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'info', label: 'Información' },
    { key: 'services', label: 'Servicios' },
    { key: 'reviews', label: `Opiniones (${clinic.ratingCount})` },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Barra superior */}
      <View style={styles.topbar}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.topTitle} numberOfLines={1}>Veterinaria</Text>
        <Pressable style={styles.back} onPress={() => Share.share({ message: `Mira ${clinic.name} en Migo 🐾` })}>
          <TabIcon name="share" color={colors.brand} size={18} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {/* Mapa real (con marcador de la clínica). Sin API key válida → pin placeholder. */}
        <View style={styles.map}>
          {showMap ? (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <MapLibreMap style={StyleSheet.absoluteFill} mapStyle={OPENFREEMAP_STYLE}>
                <Camera initialViewState={{ center: [lng, lat], zoom: 14 }} />
                <MapMarker id="clinic" lngLat={[lng, lat]}>
                  <View style={styles.pin}>
                    {clinic.logoUrl ? (
                      <Image source={{ uri: clinic.logoUrl }} style={styles.pinLogo} />
                    ) : (
                      <TabIcon name="medical" color={colors.brand} size={26} />
                    )}
                  </View>
                </MapMarker>
              </MapLibreMap>
            </View>
          ) : (
            <View style={styles.pin}>
              {clinic.logoUrl ? (
                <Image source={{ uri: clinic.logoUrl }} style={styles.pinLogo} />
              ) : (
                <TabIcon name="medical" color={colors.brand} size={26} />
              )}
            </View>
          )}
          <View style={styles.mapBtns}>
            <Pressable style={styles.mapBtn} onPress={directions}>
              <TabIcon name="navigation" color={colors.brand} size={16} />
              <Text style={styles.mapBtnText}>Cómo llegar</Text>
            </Pressable>
            <Pressable style={styles.mapBtn} onPress={openChat}>
              <TabIcon name="chat" color={colors.brand} size={16} />
              <Text style={styles.mapBtnText}>Escríbenos</Text>
            </Pressable>
          </View>
        </View>

        {/* Encabezado clínica */}
        <View style={styles.headRow}>
          {clinic.logoUrl ? (
            <Image source={{ uri: clinic.logoUrl }} style={styles.logo} />
          ) : (
            <View style={[styles.logo, styles.logoPh]}>
              <TabIcon name="medical" color={colors.brand} size={34} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.clinicName}>{clinic.name}</Text>
            {(clinic.acceptsEmergencies || clinic.isOpen24_7) && (
              <Text style={styles.emergency}>Urgencias 24/7</Text>
            )}
          </View>
        </View>

        {/* Ubicación + Distancia */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <View style={styles.statIcon}><TabIcon name="navigation" color={colors.brand} size={22} /></View>
            <View>
              <Text style={styles.statLabel}>Ubicación</Text>
              <Text style={styles.statValue}>{clinic.city ?? 'Caracas'}</Text>
            </View>
          </View>
          <View style={styles.stat}>
            <View style={styles.statIcon}><TabIcon name="person" color={colors.brand} size={22} /></View>
            <View>
              <Text style={styles.statLabel}>Distancia</Text>
              <Text style={styles.statValue}>{distanceKm != null ? `${distanceKm} Km` : 'n/d'}</Text>
            </View>
          </View>
        </View>

        {/* Pestañas */}
        <View style={styles.tabs}>
          {tabs.map((t) => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabActive]}>
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Contenido por pestaña */}
        {tab === 'info' && (
          <View style={{ gap: 14 }}>
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Sobre Nosotros</Text>
              <Text style={styles.blockText}>
                {clinic.description ?? 'Clínica veterinaria integral comprometida con el bienestar de tu mascota.'}
              </Text>
            </View>

            <View style={styles.block}>
              <View style={styles.blockHead}>
                <TabIcon name="calendar" color={colors.brand} size={18} />
                <Text style={styles.blockTitle}>Horario de Atención</Text>
              </View>
              {clinic.hours.length === 0 ? (
                <Muted>Horario no disponible.</Muted>
              ) : (
                clinic.hours.map((h) => (
                  <View key={h.id} style={styles.hourRow}>
                    <Text style={styles.hourDay}>{DAYS[h.dayOfWeek]}</Text>
                    <Text style={styles.hourVal}>{h.isOpen ? `${h.opensAt} - ${h.closesAt}` : 'Cerrado'}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.block}>
              <Text style={styles.blockTitle}>Contacto y Dirección</Text>
              <Pressable style={styles.contactRow} onPress={call}>
                <View style={styles.contactIcon}><TabIcon name="phone" color={colors.green} size={18} /></View>
                <Text style={styles.contactText}>{clinic.phone ?? 'No disponible'}</Text>
              </Pressable>
              <View style={styles.contactRow}>
                <View style={styles.contactIcon}><TabIcon name="navigation" color={colors.brand} size={18} /></View>
                <Text style={styles.contactText}>{clinic.address ?? clinic.city ?? 'Caracas'}</Text>
              </View>
            </View>
          </View>
        )}

        {tab === 'services' && (
          <View style={{ gap: 10 }}>
            {clinic.services.length === 0 ? (
              <Muted>Esta clínica aún no publica servicios.</Muted>
            ) : (
              clinic.services.map((s) => {
                const m = categoryMeta(s.category);
                return (
                  <View key={s.id} style={styles.svcRow}>
                    <View style={styles.svcIcon}>
                      <TabIcon name={m?.icon ?? 'paw'} color={colors.brand} size={22} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.svcName}>{s.name}</Text>
                      <Text style={styles.svcMeta}>${Number(s.priceUsd)} · {s.durationMin} min</Text>
                    </View>
                    <Pressable style={styles.agendar} onPress={() => book(s)}>
                      <Text style={styles.agendarText}>Agendar</Text>
                    </Pressable>
                  </View>
                );
              })
            )}
          </View>
        )}

        {tab === 'reviews' && (
          <View style={{ gap: 12 }}>
            {clinic.reviews.length === 0 ? (
              <Muted>Aún no hay opiniones.</Muted>
            ) : (
              clinic.reviews.map((r, i) => (
                <View key={i} style={styles.review}>
                  <View style={styles.reviewHead}>
                    <Text style={styles.reviewer}>{r.author?.fullName ?? 'Cliente Migo'}</Text>
                    <Text style={styles.stars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
                  </View>
                  {r.comment && <Text style={styles.reviewText}>{r.comment}</Text>}
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  topbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', boxShadow: cardShadow },
  backArrow: { fontSize: 30, color: colors.brand, marginTop: -4, fontWeight: '700' },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.text },

  // Mapa (placeholder estilizado, full-width rompiendo el padding del ScrollView)
  map: { height: 210, marginHorizontal: -20, marginTop: -20, marginBottom: 28, backgroundColor: '#EDE6F5', alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  pin: { width: 66, height: 66, borderRadius: 33, backgroundColor: colors.white, borderWidth: 3, borderColor: colors.brand, alignItems: 'center', justifyContent: 'center', boxShadow: cardShadow },
  pinLogo: { width: 54, height: 54, borderRadius: 27 },
  mapBtns: { position: 'absolute', bottom: -22, flexDirection: 'row', gap: 12, paddingHorizontal: 16 },
  mapBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 9, borderWidth: 1.5, borderColor: colors.brand, boxShadow: cardShadow },
  mapBtnText: { color: colors.brand, fontWeight: '800', fontSize: 15 },

  headRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  logo: { width: 80, height: 80, borderRadius: 18, backgroundColor: colors.brandLight },
  logoPh: { alignItems: 'center', justifyContent: 'center' },
  clinicName: { fontSize: 24, fontWeight: '800', color: colors.text, lineHeight: 28 },
  emergency: { color: colors.red, fontWeight: '700', marginTop: 4 },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  stat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  statIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 13, color: colors.muted },
  statValue: { fontSize: 15, fontWeight: '800', color: colors.text },

  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 13, borderRadius: radius.full, backgroundColor: colors.white, alignItems: 'center' },
  tabActive: { backgroundColor: colors.accent },
  tabText: { fontWeight: '700', color: colors.muted, fontSize: 15 },
  tabTextActive: { color: colors.text },

  block: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, boxShadow: cardShadow },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  blockTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 8 },
  blockText: { fontSize: 14, color: colors.muted, lineHeight: 21 },
  hourRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  hourDay: { fontSize: 14, color: colors.text, fontWeight: '600' },
  hourVal: { fontSize: 14, color: colors.text, fontWeight: '800' },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  contactIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  contactText: { fontSize: 15, color: colors.text, fontWeight: '600', flex: 1 },

  svcRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, backgroundColor: colors.white, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 8, boxShadow: cardShadow },
  svcIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  svcName: { fontSize: 16, fontWeight: '800', color: colors.text },
  svcMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  agendar: { borderWidth: 1.5, borderColor: colors.brand, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  agendarText: { color: colors.brand, fontWeight: '800', fontSize: 14 },

  review: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, boxShadow: cardShadow },
  reviewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  reviewer: { fontSize: 15, fontWeight: '800', color: colors.text },
  stars: { color: colors.accent, fontSize: 14 },
  reviewText: { fontSize: 14, color: colors.muted, lineHeight: 20 },
});
