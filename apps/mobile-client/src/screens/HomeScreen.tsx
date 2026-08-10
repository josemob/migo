import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { appAlert } from '../lib/dialog';
import { pickPhotoAsDataUri } from '../lib/photo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { TabIcon } from '../components/TabIcon';
import { categoryMeta } from '../lib/serviceCategories';
import { cardShadow, colors, control, radius, type } from '../theme';

const { width: W } = Dimensions.get('window');
const CARD_W = W * 0.8;

// Etiqueta amigable de cuándo es la cita ("hoy 3:00 p. m.", "mañana…", "en 2 días")
function whenLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(d) - startOfDay(now)) / (24 * 3600_000));
  const time = d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  if (days <= 0) return `hoy ${time}`;
  if (days === 1) return `mañana ${time}`;
  return `en ${days} días`;
}

interface Pet { id: string; name: string }
interface EmergencyMine { id: string; status: string }
const ACTIVE = ['TRIAGING', 'BROADCASTING', 'ACCEPTED', 'EN_ROUTE'];

const SERVICES = [
  { key: 'ai', title: 'Asistente Médico Virtual', sub: 'Analiza síntomas en segundos', icon: 'medical', color: colors.red, cta: 'Chatear con Migo', to: 'AiChat', params: undefined as any },
  { key: 'groom', title: 'Estilo y Cuidado', sub: 'Encuentra peluquerías en Caracas', icon: 'scissors', color: '#22B8C4', cta: 'Encontrar', to: 'Directorio', params: { category: 'GROOMING' } },
  { key: 'care', title: 'Migo Care', sub: 'Teleconsultas ilimitadas y descuentos', icon: 'medical', color: colors.brand, cta: 'Conocer plan', to: 'Perfil', params: undefined as any },
];

const SHORTCUTS = [
  { key: 'vax', label: 'Registrar Vacuna o Desparasitación', icon: 'syringe' },
  { key: 'rem', label: 'Agendar Recordatorio Clínico', icon: 'calendar' },
  { key: 'share', label: 'Compartir Historial Médico', icon: 'folderShare' },
];

export default function HomeScreen({ navigation }: { navigation: any }) {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('migo_banner').then(setBanner);
  }, []);

  const changeBanner = async () => {
    const uri = await pickPhotoAsDataUri([16, 5]); // recorte ancho para banner
    if (!uri) return;
    setBanner(uri);
    AsyncStorage.setItem('migo_banner', uri);
  };

  const pets = useQuery({ queryKey: ['pets'], queryFn: () => api<{ data: Pet[] }>('/me/pets') });
  const emergencies = useQuery({
    queryKey: ['my-emergencies'],
    queryFn: () => api<{ data: EmergencyMine[] }>('/emergencies/mine'),
    refetchInterval: 8000,
  });
  const pendingReview = useQuery({
    queryKey: ['pending-review'],
    queryFn: () =>
      api<{ appointment: { id: string; scheduledAt: string; clinic: { name: string }; service?: { name: string }; pet: { name: string }; vet?: { user: { fullName: string } } | null } | null }>(
        '/me/appointments/pending-review',
      ),
  });
  const toRate = pendingReview.data?.appointment ?? null;

  const nextAppt = useQuery({
    queryKey: ['next-appointment'],
    queryFn: () =>
      api<{
        appointment:
          | { id: string; scheduledAt: string; clinic: { name: string }; service?: { name: string; category?: string } | null; pet: { name: string } }
          | null;
      }>('/me/appointments/next'),
  });
  const upcoming = nextAppt.data?.appointment ?? null;
  // Solo se muestra como recordatorio si la cita es dentro de los próximos 3 días
  const soon = upcoming && new Date(upcoming.scheduledAt).getTime() - Date.now() <= 3 * 24 * 3600_000 ? upcoming : null;

  const firstName = user?.fullName?.split(' ')[0] ?? '';
  const petName = pets.data?.data[0]?.name ?? 'tu mascota';
  const active = emergencies.data?.data.find((e) => ACTIVE.includes(e.status));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.userRow} onPress={() => navigation.navigate('Configuracion')}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{firstName[0] ?? 'U'}</Text>
            </View>
            <Text style={styles.hi}>Hola, {firstName}</Text>
          </Pressable>
          <Pressable style={styles.bell} onPress={() => appAlert('Notificaciones', 'Sin novedades por ahora.')}>
            <TabIcon name="bell" color={colors.brand} size={24} />
          </Pressable>
        </View>

        {/* Califica tu cita (aparece si hay una cita completada sin calificar) */}
        {toRate && (
          <Pressable
            style={styles.rateCard}
            onPress={() =>
              navigation.navigate('Rating', {
                appointmentId: toRate.id,
                clinicName: toRate.clinic.name,
                serviceName: toRate.service?.name,
                petName: toRate.pet.name,
                vetName: toRate.vet?.user.fullName,
                timeLabel: new Date(toRate.scheduledAt).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' }),
              })
            }
          >
            <View style={styles.rateIcon}><Text style={{ fontSize: 22 }}>⭐</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rateTitle}>Califica tu cita</Text>
              <Text style={styles.rateSub}>{toRate.clinic.name} · {toRate.pet.name}</Text>
            </View>
            <Text style={styles.rateCta}>Calificar →</Text>
          </Pressable>
        )}

        {/* Recordatorio: si hay una cita en ≤3 días, se sustituye por el recordatorio de la cita
            (con el icono del servicio). Si no, muestra la sugerencia genérica de cuidado. */}
        {soon ? (
          <View style={styles.reminder}>
            <View style={styles.reminderIcon}>
              <TabIcon name={categoryMeta(soon.service?.category)?.icon ?? 'calendar'} color={colors.brand} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.reminderText}>
                Cita {soon.service?.name ? `de ${soon.service.name} ` : ''}para {soon.pet.name} {whenLabel(soon.scheduledAt)}
              </Text>
              <Text style={styles.reminderSub}>{soon.clinic.name}</Text>
            </View>
            <Pressable style={styles.reminderBtn} onPress={() => navigation.navigate('Citas')}>
              <Text style={styles.reminderBtnText}>Ver cita</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.reminder}>
            <View style={styles.reminderIcon}>
              <TabIcon name="scissors" color={colors.brand} size={22} />
            </View>
            <Text style={styles.reminderText}>A {petName} le toca un corte de pelo la próxima semana</Text>
            <Pressable style={styles.reminderBtn} onPress={() => navigation.navigate('Directorio', { category: 'GROOMING' })}>
              <Text style={styles.reminderBtnText}>Agendar cita</Text>
            </Pressable>
          </View>
        )}

        {/* Carrusel de servicios */}
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_W + 12}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (CARD_W + 12)))}
        >
          {SERVICES.map((s) => (
            <View key={s.key} style={[styles.svcCard, { width: CARD_W }]}>
              <View style={styles.svcTop}>
                <View style={[styles.svcIcon, { backgroundColor: s.color }]}>
                  <TabIcon name={s.icon} color={colors.white} size={24} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.svcTitle}>{s.title}</Text>
                  <Text style={styles.svcSub}>{s.sub}</Text>
                </View>
              </View>
              <Pressable style={styles.svcBtn} onPress={() => navigation.navigate(s.to, s.params)}>
                <Text style={styles.svcBtnText}>{s.cta}</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
        <View style={styles.dots}>
          {SERVICES.map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>

        {/* Urgencias Médicas */}
        <View style={styles.urg}>
          <Image source={require('../../assets/onboarding/slide3.png')} style={styles.urgImg} resizeMode="contain" />
          <View style={styles.urgBody}>
            <Text style={styles.urgTitle}>Urgencias Médicas</Text>
            <Text style={styles.urgSub}>Clínicas 24/7 abiertas y rutas de auxilio inmediato</Text>
            <Pressable style={styles.urgBtn} onPress={() => navigation.navigate(active ? 'Tracking' : 'Alerta', active ? { id: active.id } : undefined)}>
              <Text style={styles.urgBtnText}>{active ? 'Ver mi urgencia' : 'Ir a la Clínica'}</Text>
            </Pressable>
          </View>
        </View>

        {/* Banner publicitario (slot fijo de 62px) — reemplazable */}
        <View style={styles.bannerWrap}>
          <Pressable style={styles.banner} onPress={() => appAlert('Publicidad', 'Espacio para banner de patrocinador.')}>
            {banner ? (
              <Image source={{ uri: banner }} style={styles.bannerImg} resizeMode="cover" />
            ) : (
              <>
                <Text style={styles.bannerBrand}>BARK BITES</Text>
                <Text style={styles.bannerSub}>Natural & Delicious</Text>
                <Text style={styles.bannerCta}>Comprar →</Text>
              </>
            )}
          </Pressable>
          <Pressable style={styles.bannerEdit} onPress={changeBanner}>
            <TabIcon name="edit" color={colors.white} size={13} />
          </Pressable>
        </View>

        {/* Atajos */}
        <Text style={styles.shortcutsTitle}>Atajos</Text>
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          {SHORTCUTS.map((s) => (
            <Pressable
              key={s.key}
              style={styles.shortcut}
              onPress={() => (s.key === 'vax' ? navigation.navigate('Expediente') : appAlert('Migo', 'Función disponible próximamente.'))}
            >
              <View style={styles.shortcutIcon}>
                <TabIcon name={s.icon} color={colors.brand} size={22} />
              </View>
              <Text style={styles.shortcutLabel}>{s.label}</Text>
              <View style={styles.dotsMenu}>
                <View style={styles.menuDot} />
                <View style={styles.menuDot} />
                <View style={styles.menuDot} />
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 20, fontWeight: '800' },
  hi: { fontSize: 18, fontWeight: '700', color: colors.text },
  bell: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F1ECF5', alignItems: 'center', justifyContent: 'center' },

  rateCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginBottom: 14, padding: 14, backgroundColor: '#FEFBEA', borderRadius: radius.lg, borderWidth: 2, borderColor: colors.accent, boxShadow: cardShadow },
  rateIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FFF3C4', alignItems: 'center', justifyContent: 'center' },
  rateTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  rateSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  rateCta: { color: colors.brand, fontWeight: '800', fontSize: 14 },

  reminder: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginBottom: 18, padding: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.accent, boxShadow: cardShadow },
  reminderIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F1ECF5', alignItems: 'center', justifyContent: 'center' },
  reminderText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  reminderSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  reminderBtn: { backgroundColor: colors.accent, paddingHorizontal: control.pill.paddingH, paddingVertical: control.pill.paddingV, borderRadius: control.pill.radius, alignItems: 'center', justifyContent: 'center' },
  reminderBtnText: { ...type.bodySmall, color: colors.text },

  svcCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, justifyContent: 'space-between', gap: 16, boxShadow: cardShadow },
  svcTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  svcIcon: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  svcTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  svcSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  svcBtn: { backgroundColor: colors.brand, height: control.medium.height, borderRadius: control.medium.radius, alignItems: 'center', justifyContent: 'center' },
  svcBtnText: { ...type.h4, color: colors.white },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: 14 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  dotActive: { backgroundColor: colors.brand, width: 8, height: 8 },

  urg: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: '#FEFBEA', borderRadius: radius.lg, overflow: 'hidden', alignItems: 'center', boxShadow: cardShadow },
  urgImg: { width: 120, height: 120 },
  urgBody: { flex: 1, padding: 14, paddingLeft: 4 },
  urgTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  urgSub: { fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: 12 },
  urgBtn: { backgroundColor: colors.red, height: control.medium.height, borderRadius: control.medium.radius, alignItems: 'center', justifyContent: 'center' },
  urgBtnText: { ...type.h4, color: colors.white },

  // Banner ad slot: altura fija de 62px, reemplazable
  bannerWrap: { position: 'relative', marginHorizontal: 20, marginTop: 18 },
  banner: { height: 62, flexDirection: 'row', alignItems: 'center', backgroundColor: '#C97B3C', borderRadius: radius.md, paddingHorizontal: 16, overflow: 'hidden' },
  bannerImg: { position: 'absolute', width: '100%', height: '100%' },
  bannerEdit: { position: 'absolute', top: -8, right: -8, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  bannerBrand: { color: colors.white, fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
  bannerSub: { color: '#FFE9D2', fontSize: 12, marginLeft: 8, flex: 1 },
  bannerCta: { color: colors.white, fontSize: 13, fontWeight: '800' },

  shortcutsTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginHorizontal: 20, marginTop: 22, marginBottom: 12 },
  // Card de atajo (Figma node 112-80): padding 8/8/8/14 · gap 12 · radio 16
  shortcut: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, paddingVertical: 8, paddingLeft: 8, paddingRight: 14, boxShadow: cardShadow },
  shortcutIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(138,47,160,0.14)', alignItems: 'center', justifyContent: 'center' },
  shortcutLabel: { flex: 1, ...type.h4, color: '#444444' },
  dotsMenu: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  menuDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
});
