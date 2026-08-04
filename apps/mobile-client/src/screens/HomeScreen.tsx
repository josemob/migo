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
import { cardShadow, colors, radius } from '../theme';

const { width: W } = Dimensions.get('window');
const CARD_W = W * 0.8;

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

        {/* Recordatorio */}
        <View style={styles.reminder}>
          <View style={styles.reminderIcon}>
            <TabIcon name="scissors" color={colors.brand} size={22} />
          </View>
          <Text style={styles.reminderText}>A {petName} le toca un corte de pelo la próxima semana</Text>
          <Pressable style={styles.reminderBtn} onPress={() => navigation.navigate('Directorio', { category: 'GROOMING' })}>
            <Text style={styles.reminderBtnText}>Agendar cita</Text>
          </Pressable>
        </View>

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
              <Text style={styles.dotsMenu}>•••</Text>
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

  reminder: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginBottom: 18, padding: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.accent, boxShadow: cardShadow },
  reminderIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F1ECF5', alignItems: 'center', justifyContent: 'center' },
  reminderText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  reminderBtn: { backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.full },
  reminderBtnText: { fontWeight: '700', color: colors.text, fontSize: 13 },

  svcCard: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, justifyContent: 'space-between', gap: 16, boxShadow: cardShadow },
  svcTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  svcIcon: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  svcTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  svcSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  svcBtn: { backgroundColor: colors.brand, paddingVertical: 13, borderRadius: radius.full, alignItems: 'center' },
  svcBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: 14 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  dotActive: { backgroundColor: colors.brand, width: 8, height: 8 },

  urg: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: '#FEFBEA', borderRadius: radius.lg, overflow: 'hidden', alignItems: 'center', boxShadow: cardShadow },
  urgImg: { width: 120, height: 120 },
  urgBody: { flex: 1, padding: 14, paddingLeft: 4 },
  urgTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  urgSub: { fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: 12 },
  urgBtn: { backgroundColor: colors.red, paddingVertical: 12, borderRadius: radius.full, alignItems: 'center' },
  urgBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },

  // Banner ad slot: altura fija de 62px, reemplazable
  bannerWrap: { position: 'relative', marginHorizontal: 20, marginTop: 18 },
  banner: { height: 62, flexDirection: 'row', alignItems: 'center', backgroundColor: '#C97B3C', borderRadius: radius.md, paddingHorizontal: 16, overflow: 'hidden' },
  bannerImg: { position: 'absolute', width: '100%', height: '100%' },
  bannerEdit: { position: 'absolute', top: -8, right: -8, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  bannerBrand: { color: colors.white, fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
  bannerSub: { color: '#FFE9D2', fontSize: 12, marginLeft: 8, flex: 1 },
  bannerCta: { color: colors.white, fontSize: 13, fontWeight: '800' },

  shortcutsTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginHorizontal: 20, marginTop: 22, marginBottom: 12 },
  shortcut: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.white, borderRadius: radius.lg, padding: 14, boxShadow: cardShadow },
  shortcutIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#F1ECF5', alignItems: 'center', justifyContent: 'center' },
  shortcutLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  dotsMenu: { color: colors.brand, fontWeight: '900', fontSize: 16 },
});
