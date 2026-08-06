import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';

export default function ChatsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}><Text style={styles.title}>Chats con Clientes</Text></View>
      <View style={styles.center}>
        <Text style={styles.icon}>💬</Text>
        <Text style={styles.txt}>Conversaciones con dueños, envío de fotos y de servicios para agendar/pagar — próxima entrega.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  head: { padding: 20 },
  title: { fontSize: 24, fontWeight: '900', color: colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  icon: { fontSize: 40 },
  txt: { color: colors.muted, fontSize: 15, textAlign: 'center' },
});
