import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '../components/BackButton';
import { colors } from '../theme';

export default function PatientDetailScreen({ navigation, route }: any) {
  const name = route.params?.name ?? 'Paciente';
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Ficha del Paciente</Text>
        <View style={{ width: 44 }} />
      </View>
      <View style={styles.center}>
        <Text style={styles.icon}>🐶</Text>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.txt}>Ficha completa, historial de atenciones e "Iniciar nueva consulta" — próxima entrega.</Text>
        <Pressable style={styles.cta} onPress={() => navigation.navigate('NewConsult', route.params)}>
          <Text style={styles.ctaTxt}>+ Iniciar Nueva Consulta</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 18, fontWeight: '800', color: colors.brand },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  icon: { fontSize: 48 },
  name: { fontSize: 22, fontWeight: '900', color: colors.text },
  txt: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  cta: { backgroundColor: colors.brand, borderRadius: 16, paddingHorizontal: 22, paddingVertical: 14, marginTop: 10 },
  ctaTxt: { color: colors.white, fontWeight: '800', fontSize: 16 },
});
