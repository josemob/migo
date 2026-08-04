import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { editField } from '../lib/editField';
import { pickPhotoAsDataUri } from '../lib/photo';
import { Loading } from '../components/ui';
import { TabIcon } from '../components/TabIcon';
import { cardShadow, colors, radius } from '../theme';

interface Ficha {
  id: string;
  name: string;
  breed?: string;
  species: string;
  birthDate?: string;
  weightKg?: string;
  color?: string;
  microchip?: string;
  photoUrl?: string;
  alias?: string;
  size?: string;
  specialCondition?: string;
  frequentVet?: string;
  allergies: { substance: string }[];
  conditions: { name: string }[];
  vaccinations: { nextDueAt?: string }[];
  records: { clinic?: { name: string } }[];
}

const ageText = (iso?: string) => {
  if (!iso) return '—';
  const b = new Date(iso);
  const now = new Date();
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
  const years = Math.floor(months / 12);
  months = months % 12;
  return `${years} año${years === 1 ? '' : 's'}${months ? ` y ${months} meses` : ''}`;
};

export default function PetProfileScreen({ route, navigation }: { route: any; navigation: any }) {
  const { id } = route.params;
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['pet', id], queryFn: () => api<Ficha>(`/me/pets/${id}`) });

  const del = useMutation({
    mutationFn: () => api(`/me/pets/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pets'] });
      navigation.goBack();
    },
    onError: (e) => appAlert('No se pudo eliminar', e instanceof Error ? e.message : 'Intenta de nuevo'),
  });

  const soon = () => appAlert('Migo', 'Edición disponible próximamente.');

  const [photoOverride, setPhotoOverride] = useState<string | null>(null);
  const changePhoto = async () => {
    const uri = await pickPhotoAsDataUri();
    if (!uri) return;
    setPhotoOverride(uri);
    try {
      await api(`/me/pets/${id}`, { method: 'PATCH', body: { photoUrl: uri } });
      qc.invalidateQueries({ queryKey: ['pet', id] });
      qc.invalidateQueries({ queryKey: ['pets'] });
    } catch (e) {
      appAlert('No se pudo guardar la foto', e instanceof Error ? e.message : 'Intenta de nuevo');
    }
  };

  const patch = async (body: Record<string, unknown>) => {
    await api(`/me/pets/${id}`, { method: 'PATCH', body });
    qc.invalidateQueries({ queryKey: ['pet', id] });
    qc.invalidateQueries({ queryKey: ['pets'] });
  };
  const editText = (title: string, field: string, current?: string, multiline = false) =>
    editField({ title, value: current ?? '', multiline, onSave: (v) => patch({ [field]: v.trim() || null }) });
  const editNum = (title: string, field: string, current?: string) =>
    editField({ title, value: current ?? '', numeric: true, onSave: (v) => patch({ [field]: v ? Number(v) : null }) });

  if (isLoading || !data) return <Loading />;

  const vaxOk = data.vaccinations.every((v) => !v.nextDueAt || new Date(v.nextDueAt) > new Date());
  const vet = data.frequentVet ?? data.records.find((r) => r.clinic)?.clinic?.name;
  const allergiesStr = data.allergies.map((a) => a.substance).join(', ');
  const birthISO = data.birthDate ? new Date(data.birthDate).toISOString().slice(0, 10) : '';

  const confirmDelete = () =>
    appAlert(`Eliminar perfil de ${data.name}`, 'Se borrará su perfil e historial. Esta acción es permanente.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => del.mutate() },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Perfil de {data.name}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Card principal */}
        <View style={styles.hero}>
          <Pressable style={styles.avatarWrap} onPress={changePhoto}>
            {photoOverride ?? data.photoUrl ? (
              <Image source={{ uri: (photoOverride ?? data.photoUrl) as string }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPh]}>
                <Text style={{ fontSize: 34 }}>{data.species === 'CAT' ? '🐱' : '🐶'}</Text>
              </View>
            )}
            <View style={styles.editBadge}>
              <TabIcon name="edit" color={colors.white} size={13} />
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{data.name}</Text>
            <Text style={styles.sub}>{data.breed} · {ageText(data.birthDate)}</Text>
            <View style={[styles.badge, { backgroundColor: vaxOk ? '#DCF5E4' : '#FDECEC' }]}>
              <Text style={{ color: vaxOk ? colors.green : colors.red, fontWeight: '700', fontSize: 12 }}>
                {vaxOk ? 'Salud al día' : 'Requiere atención'}
              </Text>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.stats}>
          <Stat label="Peso" value={data.weightKg ? `${data.weightKg} Kg` : '—'} onEdit={() => editNum('Peso (Kg)', 'weightKg', data.weightKg ? String(data.weightKg) : '')} />
          <Stat label="Tamaño" value={data.size ?? '—'} onEdit={() => editText('Tamaño (Pequeño/Mediano/Grande)', 'size', data.size)} />
          <Stat label="Microchip" value={data.microchip ? `#${data.microchip}` : '—'} onEdit={() => editText('Microchip', 'microchip', data.microchip)} />
        </View>

        <Text style={styles.section}>Detalles Básicos</Text>
        <View style={styles.card}>
          <Field label="Fecha de Nacimiento" value={data.birthDate ? new Date(data.birthDate).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'} onEdit={() => editText('Fecha de Nacimiento (AAAA-MM-DD)', 'birthDate', birthISO)} />
          <Field label="Color de Pelaje" value={data.color ?? '—'} onEdit={() => editText('Color de Pelaje', 'color', data.color)} border />
          <Field label="Alias de Cariño" value={data.alias ?? '—'} onEdit={() => editText('Alias de Cariño', 'alias', data.alias)} border />
        </View>

        <Text style={styles.section}>Salud y Alergias</Text>
        <View style={styles.card}>
          <Field
            label="Alergias Conocidas"
            value={allergiesStr || 'Ninguna conocida'}
            valueColor={data.allergies.length ? colors.red : undefined}
            onEdit={() => editField({ title: 'Alergias Conocidas', value: allergiesStr, multiline: true, onSave: (v) => patch({ allergiesText: v }) })}
          />
          <Field label="Condición Especial" value={data.specialCondition ?? '—'} onEdit={() => editText('Condición Especial', 'specialCondition', data.specialCondition, true)} border />
          <Field label="Veterinaria Frecuente" value={vet ?? '—'} onEdit={() => editText('Veterinaria Frecuente', 'frequentVet', data.frequentVet)} border />
        </View>

        <Text style={styles.section}>Acciones</Text>
        <View style={styles.card}>
          <Action icon="calendar" label="Calendario de cuidados" onPress={soon} />
          <Action icon="syringe" label="Historial de vacunas" onPress={soon} border />
          <Action icon="file" label="Exportar expediente médico" onPress={soon} border />
        </View>

        <Pressable style={styles.delBtn} onPress={confirmDelete} disabled={del.isPending}>
          <Text style={styles.delText}>{del.isPending ? 'Eliminando…' : `Eliminar perfil de ${data.name}`}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <View style={styles.stat}>
      <Pressable style={styles.statEdit} onPress={onEdit}>
        <TabIcon name="edit" color={colors.muted} size={14} />
      </Pressable>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Field({ label, value, onEdit, border, valueColor }: { label: string; value: string; onEdit: () => void; border?: boolean; valueColor?: string }) {
  return (
    <View style={[styles.field, border && styles.fieldBorder]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={[styles.fieldValue, valueColor && { color: valueColor }]}>{value}</Text>
      </View>
      <Pressable onPress={onEdit} hitSlop={10}>
        <TabIcon name="edit" color={colors.muted} size={16} />
      </Pressable>
    </View>
  );
}

function Action({ icon, label, onPress, border }: { icon: string; label: string; onPress: () => void; border?: boolean }) {
  return (
    <Pressable style={[styles.action, border && styles.fieldBorder]} onPress={onPress}>
      <TabIcon name={icon} color={colors.brand} size={20} />
      <Text style={styles.actionLabel}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  back: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  backArrow: { fontSize: 22, color: colors.text },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },

  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, borderWidth: 2, borderColor: colors.accent, boxShadow: cardShadow },
  avatarWrap: { position: 'relative' },
  avatar: { width: 76, height: 76, borderRadius: 18 },
  avatarPh: { backgroundColor: '#EFE3F5', alignItems: 'center', justifyContent: 'center' },
  editBadge: { position: 'absolute', top: -6, right: -6, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  name: { fontSize: 24, fontWeight: '800', color: colors.text },
  sub: { fontSize: 15, color: colors.muted, marginTop: 2 },
  badge: { alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8 },

  stats: { flexDirection: 'row', gap: 12, marginTop: 16 },
  stat: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, padding: 14, boxShadow: cardShadow },
  statEdit: { position: 'absolute', top: 10, right: 10 },
  statLabel: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  statValue: { fontSize: 17, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 4 },

  section: { fontSize: 15, color: colors.muted, fontWeight: '600', marginTop: 24, marginBottom: 10, marginLeft: 4 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, boxShadow: cardShadow },
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  fieldBorder: { borderTopWidth: 1, borderTopColor: '#F0ECF3' },
  fieldLabel: { fontSize: 13, color: colors.muted },
  fieldValue: { fontSize: 16, color: colors.text, marginTop: 3 },

  action: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  actionLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  chevron: { fontSize: 24, color: '#C9BBD3' },

  delBtn: { marginTop: 24, height: 56, borderRadius: 16, borderWidth: 1.5, borderColor: colors.red, alignItems: 'center', justifyContent: 'center' },
  delText: { color: colors.red, fontSize: 16, fontWeight: '800' },
});
