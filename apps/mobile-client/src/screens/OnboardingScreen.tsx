import { useRef, useState } from 'react';
import { Dimensions, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import { Logo } from '../components/Logo';
import { colors } from '../theme';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    image: require('../../assets/onboarding/slide1.png'),
    title: 'Asistente Médico Virtual',
    text: 'Cuéntale a Migo los síntomas de tu mascota y nuestra IA te dará un triaje claro en segundos.',
  },
  {
    image: require('../../assets/onboarding/slide2.png'),
    title: 'Historial Clínico Inteligente',
    text: 'Tómale una foto a sus vacunas o informes médicos. Migo escanea, lee y organiza su historial por ti.',
  },
  {
    image: require('../../assets/onboarding/slide3.png'),
    title: 'Tranquilidad ante Emergencias',
    text: 'Encuentra clínicas veterinarias 24/7 abiertas cerca de ti y activa rutas de auxilio cuando cada segundo cuenta.',
  },
];

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const ref = useRef<ScrollView>(null);
  const last = index === SLIDES.length - 1;

  const next = () => {
    if (last) return onDone();
    const to = index + 1;
    ref.current?.scrollTo({ x: to * width, animated: true });
    setIndex(to);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.logo}>
        <Logo width={130} />
      </View>

      {/* Empuja la imagen + texto + botones hacia abajo */}
      <View style={{ flex: 1 }} />

      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        style={{ flexGrow: 0 }}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={[styles.slide, { width }]}>
            <Image source={s.image} style={styles.image} resizeMode="contain" />
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.text}>{s.text}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.actions}>
        <Button title={last ? 'Crear una cuenta' : 'Siguiente'} onPress={next} />
        <Button title="Saltar" onPress={onDone} variant="outline" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas, paddingBottom: 32 },
  logo: { alignItems: 'center', paddingTop: 20 },
  slide: { alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 32 },
  image: { width: width * 0.7, height: width * 0.7, marginBottom: 36 },
  title: { fontSize: 24, fontWeight: '800', color: colors.brand, textAlign: 'center', marginBottom: 12 },
  text: { fontSize: 16, color: colors.muted, textAlign: 'center', lineHeight: 23 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 24, backgroundColor: colors.brand },
  actions: { paddingHorizontal: 24, gap: 12 },
});
