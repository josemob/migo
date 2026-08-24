import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { Button } from '../components/ui';
import { TabIcon } from '../components/TabIcon';
import { cardShadow, colors, radius } from '../theme';

const POSITIVE = ['Trato cariñoso', 'Puntualidad 10/10', 'Médicos TOP', 'Súper limpio', '¡Volveremos!'];
const IMPROVE = ['Un poco lento', 'Algo costoso', 'Local pequeño', 'Atención fría', 'Resultado regular'];

export default function RatingScreen({ navigation, route }: any) {
  const p = route.params as {
    appointmentId: string;
    clinicName?: string;
    serviceName?: string;
    petName?: string;
    vetName?: string;
    timeLabel?: string;
  };

  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const options = rating >= 4 || rating === 0 ? POSITIVE : IMPROVE;
  const toggleTag = (t: string) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const setStars = (n: number) => {
    setRating(n);
    setTags([]); // las etiquetas cambian según el rating
  };

  const goHome = () => navigation.navigate('Tabs', { screen: 'Home' });

  const submit = async () => {
    if (rating === 0) return appAlert('Falta tu calificación', 'Toca las estrellas para calificar la atención.');
    setBusy(true);
    try {
      await api(`/me/appointments/${p.appointmentId}/review`, {
        method: 'POST',
        body: { rating, comment: comment.trim() || undefined, tags },
      });
      appAlert('¡Gracias por tu opinión! 🐾', 'Tu calificación ayuda a otros dueños y a mejorar la atención.', [
        { text: 'Volver al inicio', onPress: goHome },
      ]);
    } catch (e) {
      appAlert('No se pudo enviar', e instanceof Error ? e.message : 'Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Barra con X para cerrar (vuelve al inicio) */}
      <View style={styles.topbar}>
        <Pressable style={styles.close} onPress={goHome} hitSlop={12}>
          <Text style={styles.closeX}>✕</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Image source={require('../../assets/onboarding/slide3.png')} style={styles.hero} resizeMode="contain" />
        <Text style={styles.title}>¡Cita concluida!</Text>
        <Text style={styles.subtitle}>¿Qué tal la atención para {p.petName ?? 'tu mascota'}?</Text>

        {/* Resumen de la cita */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <TabIcon name="medical" color={colors.brand} size={18} />
            <Text style={styles.cardClinic}>{p.clinicName ?? 'Clínica'}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.cardRow}>
            <TabIcon name="scissors" color={colors.brand} size={16} />
            <Text style={styles.cardMeta}>{p.serviceName ?? 'Servicio'}{p.timeLabel ? ` · ${p.timeLabel}` : ''}</Text>
          </View>
          {p.vetName ? (
            <>
              <View style={styles.divider} />
              <View style={styles.cardRow}>
                <TabIcon name="person" color={colors.brand} size={16} />
                <Text style={styles.cardMeta}>Te atendió {p.vetName}</Text>
              </View>
            </>
          ) : null}
        </View>
        <Text style={styles.ratesBoth}>
          Tu calificación es para la clínica{p.vetName ? ' y para el profesional que te atendió' : ''}.
        </Text>

        {/* Estrellas */}
        <Text style={styles.q}>¿Cómo fue tu experiencia?</Text>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setStars(n)} hitSlop={6}>
              <Text style={[styles.star, n <= rating && styles.starOn]}>{n <= rating ? '★' : '☆'}</Text>
            </Pressable>
          ))}
        </View>

        {/* Etiquetas rápidas */}
        <Text style={styles.tagsLabel}>¿Qué es lo que más te gustó? (Opcional)</Text>
        <View style={styles.tags}>
          {options.map((t) => {
            const on = tags.includes(t);
            return (
              <Pressable key={t} onPress={() => toggleTag(t)} style={[styles.tag, on && styles.tagOn]}>
                <Text style={[styles.tagText, on && styles.tagTextOn]}>{t}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Comentario */}
        <View style={styles.commentHead}>
          <Text style={styles.tagsLabel}>Déjanos un comentario</Text>
          <Text style={styles.counter}>Máx. 250 caracteres</Text>
        </View>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            placeholder="Escribe tu experiencia aquí…"
            placeholderTextColor={colors.muted}
            value={comment}
            onChangeText={(t) => t.length <= 250 && setComment(t)}
            multiline
          />
        </View>

        <View style={{ gap: 12, marginTop: 22 }}>
          <Button title={busy ? 'Enviando…' : 'Enviar calificación'} onPress={submit} loading={busy} />
          <Button title="Volver al inicio" variant="outline" onPress={goHome} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3EEF7' },
  topbar: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 2 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', boxShadow: cardShadow },
  closeX: { fontSize: 18, color: colors.text, fontWeight: '800' },
  hero: { width: '100%', height: 160, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '900', color: colors.brand, textAlign: 'center' },
  subtitle: { fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 4, marginBottom: 20 },

  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, boxShadow: cardShadow },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardClinic: { fontSize: 16, fontWeight: '800', color: colors.text, flex: 1 },
  cardMeta: { fontSize: 14, color: colors.muted, flex: 1 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  ratesBoth: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 10 },

  q: { fontSize: 15, fontWeight: '800', color: colors.brand, textAlign: 'center', marginTop: 24 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 },
  star: { fontSize: 44, color: '#E3D7EC' },
  starOn: { color: colors.accent },

  tagsLabel: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 22 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 12 },
  tag: { borderWidth: 1.5, borderColor: colors.brand, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.white },
  tagOn: { backgroundColor: colors.brand },
  tagText: { color: colors.brand, fontWeight: '700', fontSize: 13 },
  tagTextOn: { color: colors.white },

  commentHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  counter: { fontSize: 12, color: colors.muted, marginTop: 22 },
  inputWrap: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginTop: 10, boxShadow: cardShadow },
  input: { padding: 14, fontSize: 15, color: colors.text, height: 110, textAlignVertical: 'top' },
});
