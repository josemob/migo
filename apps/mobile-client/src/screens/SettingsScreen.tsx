import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { appAlert } from '../lib/dialog';
import { Button } from '../components/ui';
import { TabIcon } from '../components/TabIcon';
import { BackButton } from '../components/BackButton';
import { cardShadow, colors, radius } from '../theme';

interface Pet { id: string; name: string }

type Row = {
  icon: string;
  title: string;
  sub: string;
  accent?: boolean; // ícono amarillo + título morado (Agregar mascota)
  toggle?: boolean;
  onPress?: () => void;
};

export default function SettingsScreen({ navigation }: { navigation: any }) {
  const { logout } = useAuth();
  const [bio, setBio] = useState(true);
  const pets = useQuery({ queryKey: ['pets'], queryFn: () => api<{ data: Pet[] }>('/me/pets') });
  const petNames = pets.data?.data.map((p) => p.name).join(', ') || 'Sin mascotas aún';

  const soon = () => appAlert('Migo', 'Función disponible próximamente.');

  // "Tus consentidos": 1 mascota → perfil directo; varias → menú; ninguna → registrar
  const openPets = () => {
    const list = pets.data?.data ?? [];
    if (list.length === 0) return navigation.navigate('RegisterPet');
    if (list.length === 1) return navigation.navigate('PetProfile', { id: list[0]!.id });
    appAlert('Tus consentidos', 'Elige una mascota', [
      ...list.map((p) => ({ text: p.name, onPress: () => navigation.navigate('PetProfile', { id: p.id }) })),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);
  };

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: 'Cuenta',
      rows: [
        { icon: 'person', title: 'Información personal', sub: 'Cambia tu nombre, correo o foto de perfil.', onPress: () => navigation.navigate('Perfil') },
        { icon: 'finance', title: 'Métodos de pago', sub: 'Tarjetas guardadas y facturación.', onPress: soon },
      ],
    },
    {
      title: 'Mascotas',
      rows: [
        { icon: 'paw', title: 'Tus consentidos', sub: petNames, onPress: openPets },
        { icon: 'plus', title: 'Agregar otra mascota', sub: 'Configura el perfil de un nuevo compañero.', accent: true, onPress: () => navigation.navigate('RegisterPet') },
      ],
    },
    {
      title: 'Preferencias y agendas',
      rows: [
        { icon: 'calendar', title: 'Agenda de cuidados', sub: 'Gestiona alertas de vacunas, desparasitación y citas.', onPress: soon },
        { icon: 'bell', title: 'Notificaciones de la app', sub: 'Elige si prefieres alertas por Push, Email o WhatsApp.', onPress: soon },
      ],
    },
    {
      title: 'Seguridad',
      rows: [
        { icon: 'lock', title: 'Contraseña y acceso', sub: 'Actualiza tus credenciales de seguridad.', onPress: soon },
        { icon: 'fingerprint', title: 'Acceso rápido con Biometría', sub: 'Activa el reconocimiento facial o dactilar.', toggle: true },
      ],
    },
    {
      title: 'Migo app',
      rows: [
        { icon: 'chat', title: 'Soporte técnico', sub: 'Chatea con nuestro equipo de asistencia.', onPress: soon },
        { icon: 'file', title: 'Políticas de privacidad', sub: 'Términos, condiciones y protección de datos.', onPress: soon },
      ],
    },
  ];

  const confirmDelete = () =>
    appAlert('Eliminar cuenta', 'Esta acción es permanente. ¿Deseas continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: soon },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>Configuración</Text>
        <Pressable style={styles.skip} onPress={() => navigation.goBack()}>
          <Text style={styles.skipText}>Saltar</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {sections.map((section) => (
          <View key={section.title} style={{ marginBottom: 22 }}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.card}>
              {section.rows.map((row, i) => (
                <Pressable
                  key={row.title}
                  onPress={row.toggle ? () => setBio((v) => !v) : row.onPress}
                  style={[styles.row, i > 0 && styles.rowBorder]}
                >
                  <View style={[styles.rowIcon, row.accent && { backgroundColor: colors.accent }]}>
                    <TabIcon name={row.icon} color={row.accent ? colors.text : colors.brand} size={22} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, row.accent && { color: colors.brand }]}>{row.title}</Text>
                    <Text style={styles.rowSub}>{row.sub}</Text>
                  </View>
                  {row.toggle ? (
                    <Toggle value={bio} onChange={setBio} />
                  ) : (
                    <Text style={styles.chevron}>›</Text>
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <View style={{ gap: 12, marginTop: 4 }}>
          <Button title="Cerrar Sesión" onPress={logout} variant="primary" />
          <Button title="Eliminar Cuenta" onPress={confirmDelete} variant="dangerOutline" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={[styles.toggle, { backgroundColor: value ? colors.brand : '#D8D2DE' }]}
    >
      <View style={[styles.knob, { alignSelf: value ? 'flex-end' : 'flex-start' }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  back: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  backArrow: { fontSize: 22, color: colors.text },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },
  skip: { backgroundColor: '#FFFDEB', borderWidth: 1.5, borderColor: colors.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.full },
  skipText: { fontWeight: '800', color: colors.text },

  sectionTitle: { fontSize: 14, color: colors.muted, marginBottom: 10, marginLeft: 4 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, boxShadow: cardShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#F0ECF3' },
  rowIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#F1ECF5', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  rowSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  chevron: { fontSize: 24, color: '#C9BBD3' },

  toggle: { width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white },
});
