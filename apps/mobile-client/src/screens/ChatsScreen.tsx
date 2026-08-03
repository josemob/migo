import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Muted, Screen } from '../components/ui';
import { TabIcon } from '../components/TabIcon';
import { colors, radius } from '../theme';

export default function ChatsScreen() {
  return (
    <Screen>
      <Text style={styles.title}>Chats</Text>

      <Pressable onPress={() => Alert.alert('Migo AI', 'El asistente conversacional llega pronto.')}>
        <Card style={styles.migoCard}>
          <View style={[styles.icon, { backgroundColor: colors.red }]}>
            <TabIcon name="medical" color={colors.white} size={24} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Asistente Médico Migo</Text>
            <Muted>Cuéntale los síntomas de tu mascota y recibe orientación al instante.</Muted>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Card>
      </Pressable>

      <Text style={styles.section}>Conversaciones con clínicas</Text>
      <View style={styles.empty}>
        <TabIcon name="chat" color="#C9BBD3" size={40} />
        <Muted>Aún no tienes chats con clínicas.</Muted>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  migoCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  chevron: { fontSize: 26, color: colors.muted },
  section: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 8 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 40, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
});
