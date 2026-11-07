import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '../components/BackButton';
import { TabIcon } from '../components/TabIcon';
import { Loading } from '../components/ui';
import { ApptCard, DayHeader, groupByDay, useUpcomingAppts } from '../components/Appointments';
import { usePullRefresh } from '../lib/refresh';
import { colors } from '../theme';

// Agenda del vet ("Ver todo" del inicio): todas sus citas por atender, agrupadas por día,
// con las atrasadas (días anteriores sin concluir) arriba.
export default function AgendaScreen({ navigation }: { navigation: any }) {
  const { query, list, confirmComplete, completing } = useUpcomingAppts();
  const refreshControl = usePullRefresh(() => query.refetch());
  const groups = groupByDay(list);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Agenda</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        {query.isLoading ? (
          <Loading />
        ) : query.isError ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTxt}>No pudimos cargar tu agenda.</Text>
            <Pressable onPress={() => void query.refetch()}><Text style={styles.link}>Reintentar</Text></Pressable>
          </View>
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <TabIcon name="calendar" color="#C9BBD3" size={40} />
            <Text style={styles.emptyTxt}>No tienes citas por atender.</Text>
          </View>
        ) : (
          groups.map((g) => (
            <View key={g.title}>
              <DayHeader title={g.title} overdue={g.overdue} />
              {g.items.map((a) => (
                <ApptCard
                  key={a.id}
                  a={a}
                  disabled={completing}
                  onComplete={() => confirmComplete(a)}
                  onOpen={() => navigation.navigate('PatientDetail', { petId: a.pet.id, name: a.pet.name })}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  emptyTxt: { color: colors.muted, fontSize: 14 },
  link: { color: colors.brand, fontWeight: '700', fontSize: 14 },
});
