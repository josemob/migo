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
import Svg, { Path } from 'react-native-svg';
import { appAlert } from '../lib/dialog';
import { pickPhotoAsDataUri } from '../lib/photo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { breedImage } from '../lib/breeds';
import { TabIcon } from '../components/TabIcon';
import { cardShadow, colors, control, radius, type } from '../theme';

const { width: W } = Dimensions.get('window');
// Dos tarjetas por vista: (ancho - padding lateral 20*2 - gap 12) / 2
const CARD_GAP = 12;
const CARD_W = (W - 40 - CARD_GAP) / 2;

interface Pet { id: string; name: string; breed?: string | null; weightKg?: string | number | null; birthDate?: string | null; size?: string | null }
interface EmergencyMine { id: string; status: string }
const ACTIVE = ['TRIAGING', 'BROADCASTING', 'ACCEPTED', 'EN_ROUTE'];

// Edad legible desde la fecha de nacimiento ("2a", "8m")
function ageLabel(birthDate?: string | null): string | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const mDiff = now.getMonth() - d.getMonth();
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < d.getDate())) years--;
  if (years >= 1) return `${years}a`;
  const months = Math.max(0, years * 12 + mDiff + (now.getDate() < d.getDate() ? -1 : 0));
  return `${months}m`;
}

const SIZE_SHORT: Record<string, string> = { pequeño: 'P', pequeno: 'P', mediano: 'M', grande: 'G' };
function sizeLabel(size?: string | null): string | null {
  if (!size) return null;
  return SIZE_SHORT[size.trim().toLowerCase()] ?? size.trim().charAt(0).toUpperCase();
}

function weightLabel(w?: string | number | null): string | null {
  if (w === null || w === undefined || w === '') return null;
  const n = Number(w);
  if (!isFinite(n) || n <= 0) return null;
  return `${Number(n.toFixed(1))}kg`;
}

function fmtCitaDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// Iconos de los botones de servicio (SVG del design system)
const BTN_ICON_PATHS: Record<string, { vb: string; d: string }> = {
  chat: {
    vb: '0 0 19 18',
    d: 'M4.62988 1.2078C7.14598 -0.1213 10.0717 -0.364008 12.7617 0.532017C15.0602 1.30528 17.0644 2.88294 18.167 5.13163C18.4997 5.81126 18.7332 6.5385 18.8584 7.28885C18.8811 7.42696 18.8985 7.56628 18.916 7.70487C18.9292 7.80936 18.932 8.02758 18.9648 8.11698V9.01444C18.924 9.13971 18.9138 9.4493 18.8936 9.59842C18.8425 9.97385 18.7647 10.345 18.6611 10.7088C18.0044 12.9753 16.4018 14.7667 14.4033 15.8738C13.3684 16.4405 12.2468 16.8214 11.0879 16.9998C10.4464 17.102 9.82615 17.1283 9.17871 17.1238C8.65477 17.1201 8.12854 17.1238 7.60449 17.1238L1.58789 17.1228C1.33402 17.1228 0.622555 17.152 0.416992 17.0887C0.255101 17.0387 0.148722 16.9334 0.0703125 16.783C0.0434067 16.7313 0.0305735 16.6689 0 16.6209V16.3953C0.0326055 16.3493 0.0722954 16.1966 0.139648 16.114C0.2093 16.0287 0.284103 15.936 0.355469 15.8504L0.754883 15.3719L2.02539 13.8445C1.87627 13.6525 1.69696 13.4452 1.55664 13.2527C0.994612 12.4841 0.568397 11.6188 0.298828 10.6971C0.16874 10.2415 0.089422 9.77217 0.0380859 9.30155C0.0258716 9.18921 0.0334327 9.01519 0 8.91288V8.07694C0.0373549 7.97742 0.0560153 7.63865 0.0732422 7.5076C0.431464 4.7838 2.29112 2.43817 4.62988 1.2078ZM8.48633 3.28299C7.61888 3.28322 6.91504 3.9868 6.91504 4.85428V6.30545H5.46387C4.59643 6.30568 3.89261 7.00928 3.89258 7.87674V9.2537C3.89276 10.121 4.59653 10.8248 5.46387 10.825H6.91504V12.2771C6.91535 13.1444 7.61907 13.8472 8.48633 13.8474H9.86328C10.7307 13.8474 11.4343 13.1445 11.4346 12.2771V10.825H12.8867C13.7541 10.8248 14.4569 10.1211 14.457 9.2537V7.87674C14.457 7.00926 13.7542 6.30564 12.8867 6.30545H11.4346V4.85428C11.4346 3.98666 10.7309 3.28299 9.86328 3.28299H8.48633Z',
  },
  paw: {
    vb: '0 0 20 20',
    d: 'M11.1823 3.18414e-05L11.1976 0.0153354C11.1787 0.117444 11.1899 0.872941 11.1904 1.03247L11.1907 8.02322C11.1908 8.19091 11.1839 8.49467 11.2043 8.65034C11.4664 8.63428 11.7926 8.64588 12.0598 8.64777L17.7302 8.68069L19.144 8.69377C19.3539 8.695 19.6776 8.70664 19.8728 8.69059L19.883 8.70073C19.8681 9.60699 19.5627 10.3861 18.905 11.0207C18.4893 11.4201 17.9705 11.6959 17.4069 11.8172C16.9329 11.9215 16.4476 11.8982 15.9639 11.8981L11.8662 11.8978C11.415 11.8979 10.8518 11.9247 10.409 11.8929C10.4048 12.251 10.4035 12.6091 10.4052 12.9672C10.4053 13.1106 10.3986 13.4526 10.4176 13.5778C11.2359 13.6872 11.901 14.0601 12.4065 14.7212C12.9257 15.3958 13.1537 16.2498 13.04 17.0934C12.9887 17.5 12.8548 17.8917 12.6465 18.2446C12.5947 18.3304 12.4241 18.5852 12.3918 18.6608L11.8878 19.1648L11.8758 19.1704C11.7021 19.2539 11.5104 19.4085 11.3182 19.5026C10.549 19.8802 9.66109 19.936 8.85071 19.6574C8.65792 19.592 8.55426 19.5499 8.38073 19.4512C8.29954 19.4051 8.00793 19.213 7.93667 19.1895L7.385 18.6378C7.36587 18.5825 7.20543 18.3323 7.16092 18.2586C7.06397 18.0999 6.98315 17.9319 6.91976 17.757C6.63499 16.9668 6.67091 16.0964 7.01978 15.3323C7.2916 14.7437 7.76886 14.2241 8.33156 13.896C8.46722 13.8169 8.68042 13.7381 8.82911 13.6831C8.84251 13.5247 8.83672 13.2973 8.83365 13.1345C8.82034 12.4316 8.85527 11.7092 8.82534 11.0082C8.69847 10.9895 7.97633 10.9941 7.82202 10.9977C7.2854 11.0104 6.66463 10.977 6.13707 11.0066C5.99819 11.7384 5.15645 12.5104 4.5051 12.8102C3.65247 13.1984 2.6735 13.1984 1.82081 12.8103C1.63039 12.7252 1.37263 12.5183 1.21102 12.4638L0.657689 11.9105C0.614845 11.7997 0.39377 11.4908 0.32055 11.3372C-0.0921338 10.4834 -0.102534 9.51508 0.265861 8.64503C0.348429 8.45003 0.602024 8.11992 0.644817 7.97274L1.21123 7.40633C1.3082 7.37351 1.50683 7.23382 1.60654 7.1771C1.81984 7.05578 2.02929 6.96186 2.26569 6.89357C3.08446 6.65017 3.96678 6.74713 4.71314 7.16253C5.36822 7.52398 5.87117 8.10929 6.12991 8.81128C6.2148 9.04215 6.25584 9.24948 6.32194 9.48323C6.7172 9.4965 7.12298 9.47672 7.51952 9.48443C7.66741 9.4873 7.85064 9.49055 7.99481 9.47568C7.97004 8.07146 7.99381 6.59215 7.99383 5.18211L7.99302 3.80845C7.99277 3.391 7.97507 2.9595 8.05597 2.55045C8.16219 2.00415 8.41251 1.49618 8.78101 1.07913C9.44814 0.326781 10.211 0.0602811 11.1823 3.18414e-05ZM8.92955 17.9155C9.61983 18.4502 10.6127 18.3245 11.148 17.6347C11.6833 16.9449 11.5585 15.9519 10.8693 15.416C10.1791 14.8793 9.18447 15.0043 8.64847 15.695C8.11247 16.3856 8.23836 17.3802 8.92955 17.9155ZM2.19912 11.1849C2.88957 11.7198 3.88287 11.5939 4.418 10.9036C4.95314 10.2133 4.82756 9.22 4.1375 8.68461C3.44708 8.14896 2.45314 8.27461 1.91773 8.96521C1.38234 9.65582 1.50832 10.6497 2.19912 11.1849ZM9.476 10.6134C9.85138 10.8467 10.3449 10.7313 10.5779 10.3557C10.8108 9.98003 10.6948 9.48664 10.3189 9.25411C9.94361 9.02196 9.45118 9.13771 9.21861 9.51275C8.98602 9.88779 9.10122 10.3804 9.476 10.6134Z',
  },
};

function BtnIcon({ name }: { name: string }) {
  const ic = BTN_ICON_PATHS[name];
  if (!ic) return null;
  return (
    <Svg width={18} height={18} viewBox={ic.vb} fill="none">
      <Path d={ic.d} fill="#FFFFFF" fillRule="evenodd" clipRule="evenodd" />
    </Svg>
  );
}

const SERVICES = [
  { key: 'ai', title: 'Asistente Médico Virtual', sub: 'Analiza síntomas en segundos', svg: 'chat', cta: 'Chatear ahora', to: 'AiChat', params: undefined as any },
  { key: 'groom', title: 'Estilo y Cuidado', sub: 'Encuentra las mejores peluquerías de tu zona', svg: 'paw', cta: 'Buscar', to: 'Directorio', params: { category: 'GROOMING' } },
  { key: 'care', title: 'Migo Care', sub: 'Teleconsultas ilimitadas y descuentos', svg: 'chat', cta: 'Conocer plan', to: 'Perfil', params: undefined as any },
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

  const firstName = user?.fullName?.split(' ')[0] ?? '';
  const avatarUrl = (user as { avatarUrl?: string } | null)?.avatarUrl;
  const pet = pets.data?.data[0] ?? null;
  const active = emergencies.data?.data.find((e) => ACTIVE.includes(e.status));

  const petChips = pet
    ? [
        weightLabel(pet.weightKg) && `Peso: ${weightLabel(pet.weightKg)}`,
        ageLabel(pet.birthDate) && `Edad: ${ageLabel(pet.birthDate)}`,
        sizeLabel(pet.size) && `Tamaño: ${sizeLabel(pet.size)}`,
      ].filter(Boolean as unknown as (v: string | null) => v is string)
    : [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.userRow} onPress={() => navigation.navigate('Configuracion')}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{firstName[0] ?? 'U'}</Text>
              </View>
            )}
            <View>
              <Text style={styles.hi}>Hola, {firstName}</Text>
              <Text style={styles.hiSub}>¿Qué quieres hacer hoy?</Text>
            </View>
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

        {/* Card de mascota: imagen según la raza + próxima cita + chips (peso/edad/tamaño) */}
        {pet && (
          <View style={styles.petCard}>
            <Image source={require('../assets/pet-card-bg.jpg')} style={StyleSheet.absoluteFill as any} resizeMode="cover" />

            {breedImage(pet.breed) ? (
              <Image source={breedImage(pet.breed)!} style={styles.petImg} resizeMode="contain" />
            ) : (
              <View style={[styles.petImg, styles.petImgFallback]}><Text style={{ fontSize: 44 }}>🐶</Text></View>
            )}

            <View style={styles.petInfo}>
              <View style={styles.petHeadGroup}>
                <Text style={styles.petName} numberOfLines={1}>{pet.name}</Text>
                <View style={styles.petCitaRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.petCitaLabel}>Próxima cita:</Text>
                    <Text style={styles.petCitaVal} numberOfLines={1}>
                      {upcoming ? `${upcoming.service?.name ?? 'Cita'} ${fmtCitaDate(upcoming.scheduledAt)}` : 'Sin citas próximas'}
                    </Text>
                  </View>
                  <Pressable style={styles.petChevron} onPress={() => navigation.navigate('Citas')}>
                    <Text style={styles.petChevronTxt}>›</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.petChipsRow}>
                {petChips.map((c) => (
                  <View key={c} style={styles.petChip}><Text style={styles.petChipTxt} numberOfLines={1}>{c}</Text></View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Carrusel de servicios */}
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_W + CARD_GAP}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: 20, gap: CARD_GAP }}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (CARD_W + CARD_GAP)))}
        >
          {SERVICES.map((s) => (
            <View key={s.key} style={[styles.svcCard, { width: CARD_W }]}>
              <View style={styles.svcTextWrap}>
                <Text style={styles.svcSub}>{s.sub}</Text>
                <Text style={styles.svcTitle}>{s.title}</Text>
              </View>
              <Pressable style={styles.svcBtn} onPress={() => navigation.navigate(s.to, s.params)}>
                <BtnIcon name={s.svg} />
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
              <Text style={styles.urgBtnText}>{active ? 'Ver mi urgencia' : 'Generar alerta'}</Text>
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
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 48, height: 48, borderRadius: 8, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#EFE3F5' },
  avatarText: { color: colors.white, fontSize: 20, fontWeight: '800' },
  hi: { fontSize: 16, fontWeight: '600', color: colors.text },
  hiSub: { fontSize: 14, fontWeight: '400', color: '#6B7280', marginTop: 1 },
  bell: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F1ECF5', alignItems: 'center', justifyContent: 'center' },

  rateCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginBottom: 14, padding: 14, backgroundColor: '#FEFBEA', borderRadius: radius.lg, borderWidth: 2, borderColor: colors.accent, boxShadow: cardShadow },
  rateIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FFF3C4', alignItems: 'center', justifyContent: 'center' },
  rateTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  rateSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  rateCta: { color: colors.brand, fontWeight: '800', fontSize: 14 },

  // Card de mascota (Figma): imagen de raza + próxima cita + chips, fondo degradado morado
  petCard: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 18, borderRadius: 24, overflow: 'hidden', paddingVertical: 10, paddingLeft: 0, paddingRight: 14, boxShadow: cardShadow },
  petImg: { width: 100, height: 100 },
  petImgFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1ECF5', borderRadius: 20 },
  petInfo: { flex: 1, alignSelf: 'stretch', justifyContent: 'space-between', paddingVertical: 2, gap: 8 },
  petHeadGroup: { alignSelf: 'stretch', gap: 3 },
  petName: { ...type.h2, color: '#444444' },
  petCitaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  petCitaLabel: { fontSize: 16, fontWeight: '700', color: '#444444' },
  petCitaVal: { fontSize: 14, color: '#000000', marginTop: 1 },
  petChevron: { width: 28, height: 28, borderRadius: 4, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  petChevronTxt: { color: colors.white, fontSize: 20, fontWeight: '800', lineHeight: 22, marginTop: -1 },
  petChipsRow: { flexDirection: 'row', gap: 5 },
  petChip: { flex: 1, backgroundColor: colors.white, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, alignItems: 'center' },
  petChipTxt: { color: colors.brand, fontSize: 12, fontWeight: '600' },

  reminder: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginBottom: 18, padding: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.accent, boxShadow: cardShadow },
  reminderIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F1ECF5', alignItems: 'center', justifyContent: 'center' },
  reminderText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  reminderSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  reminderBtn: { backgroundColor: colors.accent, paddingHorizontal: control.pill.paddingH, paddingVertical: control.pill.paddingV, borderRadius: control.pill.radius, alignItems: 'center', justifyContent: 'center' },
  reminderBtnText: { ...type.bodySmall, color: colors.text },

  // Card de servicio (Figma): radio 24 · padding 26/14/14/14 · texto centrado · botón 34px
  svcCard: { backgroundColor: colors.white, borderRadius: radius.xl, paddingTop: 26, paddingBottom: 14, paddingHorizontal: 14, justifyContent: 'space-between', gap: 18, boxShadow: cardShadow },
  svcTextWrap: { alignSelf: 'stretch', alignItems: 'center', gap: 10 },
  svcSub: { fontSize: 14, lineHeight: 16, fontWeight: '400', color: '#6F6F6F', textAlign: 'center' },
  svcTitle: { fontSize: 18, lineHeight: 20, fontWeight: '500', color: '#444444', textAlign: 'center' },
  svcBtn: { alignSelf: 'stretch', backgroundColor: colors.brand, height: 34, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 18 },
  svcBtnText: { fontSize: 16, lineHeight: 18, fontWeight: '500', color: colors.white },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: 14 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  dotActive: { backgroundColor: colors.brand, width: 8, height: 8 },

  urg: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: '#FEFBEA', borderRadius: radius.lg, overflow: 'hidden', alignItems: 'center', boxShadow: cardShadow },
  urgImg: { width: 120, height: 120 },
  urgBody: { flex: 1, padding: 14, paddingLeft: 4 },
  urgTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  urgSub: { fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: 12 },
  urgBtn: { backgroundColor: colors.accent, height: control.medium.height, borderRadius: control.medium.radius, alignItems: 'center', justifyContent: 'center' },
  urgBtnText: { ...type.h4, color: colors.text },

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
