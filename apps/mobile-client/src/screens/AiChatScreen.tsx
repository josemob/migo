import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { BackButton } from '../components/BackButton';
import { cardShadow, colors, radius } from '../theme';

interface Suggestion { action: 'emergency' | 'grooming' | 'consult'; label: string }
interface Msg { role: 'user' | 'assistant'; text: string; suggestions?: Suggestion[] }
interface Pet { id: string; name: string }

export default function AiChatScreen({ navigation }: { navigation: any }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const firstName = user?.fullName?.split(' ')[0] ?? '';
  const pets = useQuery({ queryKey: ['pets'], queryFn: () => api<{ data: Pet[] }>('/me/pets') });
  const pet = pets.data?.data[0];

  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', text: `¡Hola${firstName ? `, ${firstName}` : ''}! 👋 Soy la IA de Migo. ¿En qué puedo ayudarte hoy${pet ? ` con ${pet.name}` : ''}?` },
  ]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const toEnd = () => setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);

  // Al finalizar la interacción (salir del chat), extrae y almacena el resumen estructurado
  const stateRef = useRef({ messages, petId: pet?.id });
  stateRef.current = { messages, petId: pet?.id };
  useEffect(() => {
    return () => {
      const { messages: msgs, petId } = stateRef.current;
      if (msgs.some((m) => m.role === 'user')) {
        api('/me/ai-chat/summary', { method: 'POST', body: { messages: msgs.slice(-40), petId } }).catch(() => {});
      }
    };
  }, []);

  const send = async (raw?: string) => {
    const content = (raw ?? text).trim();
    if (!content || busy) return;
    const next: Msg[] = [...messages, { role: 'user', text: content }];
    setMessages(next);
    setText('');
    setBusy(true);
    toEnd();
    try {
      const res = await api<{ text: string; source: string; suggestions?: Suggestion[] }>('/me/ai-chat', {
        method: 'POST',
        body: { messages: next.slice(-16), petId: pet?.id },
      });
      setMessages((m) => [...m, { role: 'assistant', text: res.text, suggestions: res.suggestions }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', text: 'Ups, no pude responder ahora. Intenta de nuevo en un momento. 🐾' }]);
    } finally {
      setBusy(false);
      toEnd();
    }
  };

  // Navega según la acción sugerida por Migo IA. Directorio/Alerta viven dentro del
  // navegador de Tabs, así que hay que usar la navegación anidada { screen, params }.
  const onSuggestion = (s: Suggestion) => {
    if (s.action === 'emergency') navigation.navigate('Tabs', { screen: 'Alerta' });
    else if (s.action === 'grooming') navigation.navigate('Tabs', { screen: 'Directorio', params: { category: 'GROOMING' } });
    else navigation.navigate('Tabs', { screen: 'Directorio' });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topbar}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.topTitle}>Migo IA</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView ref={scroller} contentContainerStyle={{ padding: 16, gap: 12 }} onContentSizeChange={toEnd} showsVerticalScrollIndicator={false}>
          <View style={styles.dayChip}><Text style={styles.dayChipText}>HOY</Text></View>
          {messages.map((m, i) => (
            <View key={i} style={{ gap: 8, alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <View style={[styles.bubble, m.role === 'user' ? styles.user : styles.ai]}>
                <Text style={[styles.msgText, m.role === 'user' && { color: colors.white }]}>{m.text}</Text>
              </View>
              {m.suggestions?.map((s, j) => (
                <Pressable
                  key={j}
                  style={[styles.suggestion, s.action === 'emergency' && styles.suggestionDanger]}
                  onPress={() => onSuggestion(s)}
                >
                  <Text style={[styles.suggestionText, s.action === 'emergency' && styles.suggestionDangerText]}>{s.label}</Text>
                </Pressable>
              ))}
            </View>
          ))}
          {busy && (
            <View style={[styles.bubble, styles.ai]}>
              <Text style={styles.typing}>Migo IA está escribiendo…</Text>
            </View>
          )}
        </ScrollView>

        {/* Acciones rápidas */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} style={{ flexGrow: 0 }}>
          <Pressable style={[styles.qBtn, styles.qDanger]} onPress={() => navigation.navigate('Tabs', { screen: 'Alerta' })}>
            <Text style={styles.qDangerText}>🚨 Es una emergencia</Text>
          </Pressable>
          <Pressable style={styles.qBtn} onPress={() => navigation.navigate('Tabs', { screen: 'Directorio' })}>
            <Text style={styles.qText}>📍 ¿Dónde están?</Text>
          </Pressable>
          <Pressable style={styles.qBtn} onPress={() => send('Quiero agendar una consulta')}>
            <Text style={styles.qText}>📅 Agendar consulta</Text>
          </Pressable>
        </ScrollView>

        {/* Barra de entrada */}
        <View style={[styles.inputBar, { paddingTop: 10, paddingBottom: insets.bottom + 10 }]}>
          <TextInput
            style={styles.input}
            placeholder="Escribe un mensaje para Migo IA…"
            placeholderTextColor={colors.muted}
            value={text}
            onChangeText={setText}
            multiline
            onSubmitEditing={() => send()}
          />
          <Pressable style={[styles.sendBtn, (!text.trim() || busy) && { opacity: 0.5 }]} disabled={!text.trim() || busy} onPress={() => send()}>
            <Text style={styles.sendIcon}>➤</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  topbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', boxShadow: cardShadow },
  backArrow: { fontSize: 30, color: colors.brand, marginTop: -4, fontWeight: '700' },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },

  dayChip: { alignSelf: 'center', backgroundColor: '#E9E7EE', borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 4 },
  dayChipText: { fontSize: 12, fontWeight: '800', color: colors.muted, letterSpacing: 0.5 },

  bubble: { maxWidth: '85%', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 11 },
  ai: { alignSelf: 'flex-start', backgroundColor: '#F1EFF3', borderTopLeftRadius: 6 },
  user: { alignSelf: 'flex-end', backgroundColor: colors.brand, borderTopRightRadius: 6 },
  msgText: { fontSize: 15, color: colors.text, lineHeight: 21 },
  typing: { fontSize: 14, color: colors.muted, fontStyle: 'italic' },

  suggestion: { alignSelf: 'flex-start', maxWidth: '92%', flexDirection: 'row', alignItems: 'center', backgroundColor: colors.brandLight, borderWidth: 1.5, borderColor: colors.brand, borderRadius: radius.full, paddingHorizontal: 16, paddingVertical: 11 },
  suggestionText: { color: colors.brand, fontWeight: '800', fontSize: 14 },
  suggestionDanger: { backgroundColor: '#FDECEC', borderColor: colors.red },
  suggestionDangerText: { color: colors.red },

  quick: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  qBtn: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.white },
  qText: { fontWeight: '700', color: colors.text, fontSize: 13 },
  qDanger: { borderColor: colors.red },
  qDangerText: { fontWeight: '800', color: colors.red, fontSize: 13 },

  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.canvas, borderTopWidth: 1, borderTopColor: '#EFEBF2' },
  input: { flex: 1, maxHeight: 120, backgroundColor: colors.white, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  sendIcon: { color: colors.white, fontSize: 18, fontWeight: '900' },
});
