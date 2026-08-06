import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';

export default function NewConsultScreen({ navigation }: any) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}><Text style={styles.x}>✕</Text></Pressable>
        <Text style={styles.title}>Nueva Consulta</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={styles.center}>
        <Text style={styles.icon}>🎙️</Text>
        <Text style={styles.txt}>Formulario clínico con copiloto de voz (constantes, síntomas, diagnóstico, receta) y "Firmar y Emitir Informe" — próxima entrega.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EFEAF3' },
  x: { fontSize: 20, fontWeight: '800', color: colors.text },
  title: { fontSize: 18, fontWeight: '800', color: colors.brand },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  icon: { fontSize: 44 },
  txt: { color: colors.muted, fontSize: 15, textAlign: 'center' },
});
