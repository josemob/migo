import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '../components/BackButton';
import { colors } from '../theme';

export default function ReportScreen({ navigation }: any) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Informe Clínico</Text>
        <View style={{ width: 44 }} />
      </View>
      <View style={styles.center}>
        <Text style={styles.icon}>📄</Text>
        <Text style={styles.txt}>Reporte firmado digitalmente, imprimir/reenviar al dueño y usar como plantilla — próxima entrega.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 18, fontWeight: '800', color: colors.brand },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  icon: { fontSize: 44 },
  txt: { color: colors.muted, fontSize: 15, textAlign: 'center' },
});
