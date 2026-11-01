import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { Loading } from '../components/ui';
import { TabIcon } from '../components/TabIcon';
import { BackButton } from '../components/BackButton';
import { cardShadow, colors, radius } from '../theme';

type Kind = 'VACCINE' | 'DEWORMING';
interface Vax {
  id: string;
  kind?: Kind;
  vaccineName: string;
  appliedAt: string;
  nextDueAt?: string | null;
  lotNumber?: string | null;
  recordedByOwner?: boolean;
  clinic?: { name: string } | null;
}
interface Ficha { name: string; species: string; vaccinations: Vax[] }

// Sugerencias para no tener que escribir lo más común (el dueño puede escribir otra).
const SUGGESTIONS: Record<Kind, Record<'DOG' | 'CAT', string[]>> = {
  VACCINE: {
    DOG: ['Séxtuple / Óctuple', 'Rabia', 'Tos de perreras', 'Parvovirus'],
    CAT: ['Triple felina', 'Rabia', 'Leucemia felina'],
  },
  DEWORMING: {
    DOG: ['Antiparasitario interno', 'Pipeta / externo', 'Collar antipulgas'],
    CAT: ['Antiparasitario interno', 'Pipeta / externo'],
  },
};
const NEXT_DOSE = [
  { label: 'Sin próxima', months: 0 },
  { label: '1 mes', months: 1 },
  { label: '3 meses', months: 3 },
  { label: '6 meses', months: 6 },
  { label: '1 año', months: 12 },
];

// DD/MM/AAAA <-> Date. Se escribe solo con números: las barras se ponen solas.
const toDMY = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
function maskDMY(raw: string) {
  const n = raw.replace(/\D/g, '').slice(0, 8);
  return [n.slice(0, 2), n.slice(2, 4), n.slice(4)].filter(Boolean).join('/');
}
function parseDMY(s: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12);
  return d.getDate() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 ? d : null;
}
const addMonths = (d: Date, months: number) => new Date(d.getFullYear(), d.getMonth() + months, d.getDate(), 12);

const DAY = 86_400_000;
const fmt = (iso?: string | null) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
};

function statusOf(nextDueAt?: string | null) {
  if (!nextDueAt) return { label: 'Aplicada', color: colors.muted, bg: '#ECECEF' };
  const due = new Date(nextDueAt).getTime();
  // Fecha inválida: no la damos por "Al día" en silencio (antes todas las comparaciones eran false).
  if (Number.isNaN(due)) return { label: 'Revisar fecha', color: colors.amber, bg: '#FEF4E0' };
  const now = Date.now();
  if (due < now) return { label: 'Vencida', color: colors.red, bg: '#FDECEC' };
  if (due < now + 30 * DAY) return { label: 'Próxima', color: colors.amber, bg: '#FEF4E0' };
  return { label: 'Al día', color: colors.green, bg: '#DFF3E6' };
}

export default function VaccineCardScreen({ route, navigation }: { route: any; navigation: any }) {
  const { id, name } = (route.params ?? {}) as { id: string; name?: string };
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['pet', id], queryFn: () => api<Ficha>(`/me/pets/${id}`) });
  const [adding, setAdding] = useState(false);

  const remove = useMutation({
    mutationFn: (vaxId: string) => api(`/me/pets/${id}/vaccinations/${vaxId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pet', id] });
      qc.invalidateQueries({ queryKey: ['pets'] });
    },
    onError: (e) => appAlert('No se pudo borrar', e instanceof Error ? e.message : 'Intenta de nuevo.'),
  });
  const confirmRemove = (v: Vax) =>
    appAlert('¿Borrar este registro?', `${v.vaccineName} · ${fmt(v.appliedAt)}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => remove.mutate(v.id) },
    ]);

  const vax = data?.vaccinations ?? [];
  const vencidas = vax.filter((v) => v.nextDueAt && new Date(v.nextDueAt).getTime() < Date.now()).length;
  const proximas = vax.filter((v) => {
    if (!v.nextDueAt) return false;
    const d = new Date(v.nextDueAt).getTime();
    return d >= Date.now() && d < Date.now() + 30 * DAY;
  }).length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topbar}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.topTitle}>Cartilla de vacunación</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <Loading />
      ) : isError || !data ? (
        // Antes: spinner infinito cuando fallaba la carga.
        <View style={{ paddingHorizontal: 16, paddingVertical: 20, gap: 12 }}>
          <Text style={{ fontSize: 15, color: colors.muted }}>No pudimos cargar la cartilla. Revisa tu conexión e intenta de nuevo.</Text>
          <Pressable onPress={() => void refetch()}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.brand }}>Reintentar →</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, gap: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {/* Encabezado tipo carnet */}
          <View style={styles.hero}>
            <View style={styles.heroIcon}><TabIcon name="syringe" color={colors.white} size={26} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroPet}>{name ?? data.name}</Text>
              <Text style={styles.heroSub}>{vax.length} registro{vax.length === 1 ? '' : 's'} en la cartilla</Text>
            </View>
          </View>

          <Pressable style={styles.addBtn} onPress={() => setAdding(true)}>
            <Text style={styles.addBtnTxt}>+ Agregar vacuna o desparasitación</Text>
          </Pressable>

          {(vencidas > 0 || proximas > 0) && (
            <View style={styles.alerts}>
              {vencidas > 0 && <View style={[styles.chip, { backgroundColor: '#FDECEC' }]}><Text style={[styles.chipTxt, { color: colors.red }]}>⚠️ {vencidas} vencida{vencidas === 1 ? '' : 's'}</Text></View>}
              {proximas > 0 && <View style={[styles.chip, { backgroundColor: '#FEF4E0' }]}><Text style={[styles.chipTxt, { color: colors.amber }]}>⏰ {proximas} por vencer</Text></View>}
            </View>
          )}

          {vax.length === 0 ? (
            <View style={styles.empty}>
              <TabIcon name="syringe" color="#C9BBD3" size={40} />
              <Text style={styles.emptyTxt}>Aún no hay vacunas ni desparasitaciones.</Text>
              <Text style={styles.emptyHint}>Anota las que ya le pusieron a {name ?? data.name}; las que le aplique un veterinario de Migo aparecen solas.</Text>
            </View>
          ) : (
            vax.map((v) => {
              const s = statusOf(v.nextDueAt);
              return (
                <View key={v.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.kindTxt}>{v.kind === 'DEWORMING' ? 'Desparasitación' : 'Vacuna'}</Text>
                      <Text style={styles.vaxName}>{v.vaccineName}</Text>
                    </View>
                    <View style={[styles.status, { backgroundColor: s.bg }]}><Text style={[styles.statusTxt, { color: s.color }]}>{s.label}</Text></View>
                  </View>
                  <View style={styles.dates}>
                    <View style={styles.dateBox}>
                      <Text style={styles.dateLabel}>Aplicada</Text>
                      <Text style={styles.dateVal}>{fmt(v.appliedAt)}</Text>
                    </View>
                    <View style={styles.dateBox}>
                      <Text style={styles.dateLabel}>Próxima dosis</Text>
                      <Text style={[styles.dateVal, { color: s.color }]}>{fmt(v.nextDueAt)}</Text>
                    </View>
                  </View>
                  {(v.lotNumber || v.clinic?.name) && (
                    <Text style={styles.meta}>
                      {v.clinic?.name ? `${v.clinic.name}` : ''}{v.clinic?.name && v.lotNumber ? ' · ' : ''}{v.lotNumber ? `Lote ${v.lotNumber}` : ''}
                    </Text>
                  )}
                  {/* Solo se borra lo que anotó el dueño; lo de la clínica es historial clínico. */}
                  {v.recordedByOwner && (
                    <View style={styles.ownerRow}>
                      <Text style={styles.ownerTag}>Registrada por ti</Text>
                      <Pressable onPress={() => confirmRemove(v)} hitSlop={10} disabled={remove.isPending}>
                        <Text style={styles.removeTxt}>Borrar</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })
          )}

          <Text style={styles.foot}>Las que aplica un veterinario de Migo se registran solas. Migo te recuerda cuando toca la próxima dosis. 🐾</Text>
        </ScrollView>
      )}

      {data && (
        <AddVaxSheet
          visible={adding}
          petId={id}
          species={data.species === 'CAT' ? 'CAT' : 'DOG'}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            qc.invalidateQueries({ queryKey: ['pet', id] });
            qc.invalidateQueries({ queryKey: ['pets'] });
          }}
        />
      )}
    </SafeAreaView>
  );
}

function AddVaxSheet({ visible, petId, species, onClose, onSaved }: { visible: boolean; petId: string; species: 'DOG' | 'CAT'; onClose: () => void; onSaved: () => void }) {
  const insets = useSafeAreaInsets();
  const [kind, setKind] = useState<Kind>('VACCINE');
  const [vaccineName, setName] = useState('');
  const [applied, setApplied] = useState(toDMY(new Date()));
  const [months, setMonths] = useState(12);
  const [lot, setLot] = useState('');

  const reset = () => {
    setKind('VACCINE');
    setName('');
    setApplied(toDMY(new Date()));
    setMonths(12);
    setLot('');
  };
  const appliedDate = parseDMY(applied);

  const save = useMutation({
    mutationFn: () =>
      api(`/me/pets/${petId}/vaccinations`, {
        method: 'POST',
        body: {
          kind,
          vaccineName: vaccineName.trim(),
          appliedAt: appliedDate!.toISOString(),
          nextDueAt: months > 0 ? addMonths(appliedDate!, months).toISOString() : undefined,
          lotNumber: lot.trim() || undefined,
        },
      }),
    onSuccess: () => {
      reset();
      onSaved();
    },
    onError: (e) => appAlert('No se pudo guardar', e instanceof Error ? e.message : 'Intenta de nuevo.'),
  });

  const submit = () => {
    if (vaccineName.trim().length < 2) return appAlert('Falta el nombre', kind === 'VACCINE' ? '¿Qué vacuna le pusieron?' : '¿Qué antiparasitario le diste?');
    if (!appliedDate) return appAlert('Revisa la fecha', 'Escríbela como día/mes/año, por ejemplo 15/10/2026.');
    if (appliedDate.getTime() > Date.now() + 86_400_000) return appAlert('Revisa la fecha', 'La fecha de aplicación no puede ser futura.');
    save.mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
              <Text style={styles.sheetTitle}>Agregar a la cartilla</Text>

              <View style={styles.segment}>
                {(['VACCINE', 'DEWORMING'] as Kind[]).map((k) => (
                  <Pressable key={k} style={[styles.segBtn, kind === k && styles.segBtnOn]} onPress={() => { setKind(k); setName(''); setMonths(k === 'VACCINE' ? 12 : 3); }}>
                    <Text style={[styles.segTxt, kind === k && styles.segTxtOn]}>{k === 'VACCINE' ? '💉 Vacuna' : '🪱 Desparasitación'}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={{ gap: 8 }}>
                <Text style={styles.label}>{kind === 'VACCINE' ? '¿Qué vacuna?' : '¿Qué producto?'}</Text>
                <View style={styles.sugRow}>
                  {SUGGESTIONS[kind][species].map((s) => (
                    <Pressable key={s} style={[styles.sug, vaccineName === s && styles.sugOn]} onPress={() => setName(s)}>
                      <Text style={[styles.sugTxt, vaccineName === s && styles.sugTxtOn]}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput style={styles.input} placeholder="O escribe el nombre" placeholderTextColor={colors.muted} value={vaccineName} onChangeText={setName} maxLength={80} />
              </View>

              <View style={{ gap: 8 }}>
                <Text style={styles.label}>Fecha en que se aplicó</Text>
                <View style={styles.dateRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="DD/MM/AAAA"
                    placeholderTextColor={colors.muted}
                    value={applied}
                    onChangeText={(t) => setApplied(maskDMY(t))}
                    keyboardType="number-pad"
                    maxLength={10}
                  />
                  <Pressable style={styles.todayBtn} onPress={() => setApplied(toDMY(new Date()))}>
                    <Text style={styles.todayTxt}>Hoy</Text>
                  </Pressable>
                </View>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={styles.label}>¿Cuándo toca la próxima?</Text>
                <View style={styles.sugRow}>
                  {NEXT_DOSE.map((n) => (
                    <Pressable key={n.months} style={[styles.sug, months === n.months && styles.sugOn]} onPress={() => setMonths(n.months)}>
                      <Text style={[styles.sugTxt, months === n.months && styles.sugTxtOn]}>{n.label}</Text>
                    </Pressable>
                  ))}
                </View>
                {months > 0 && appliedDate && <Text style={styles.hint}>Te recordamos el {fmt(addMonths(appliedDate, months).toISOString())}.</Text>}
              </View>

              <View style={{ gap: 8 }}>
                <Text style={styles.label}>Lote (opcional)</Text>
                <TextInput style={styles.input} placeholder="Está en la etiqueta del frasco" placeholderTextColor={colors.muted} value={lot} onChangeText={setLot} maxLength={40} />
              </View>

              <Pressable style={[styles.saveBtn, save.isPending && { opacity: 0.6 }]} onPress={submit} disabled={save.isPending}>
                <Text style={styles.saveTxt}>{save.isPending ? 'Guardando…' : 'Guardar en la cartilla'}</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  topbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },

  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.brand, borderRadius: radius.lg, padding: 18, boxShadow: cardShadow },
  heroIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  heroPet: { fontSize: 20, fontWeight: '900', color: colors.white },
  heroSub: { fontSize: 13, color: '#F0E6F5', marginTop: 2 },

  alerts: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  chipTxt: { fontSize: 13, fontWeight: '800' },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 40, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', paddingHorizontal: 24 },
  emptyTxt: { fontSize: 15, fontWeight: '700', color: colors.text },
  emptyHint: { fontSize: 13, color: colors.muted, textAlign: 'center' },

  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, gap: 10, boxShadow: cardShadow },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  vaxName: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.text },
  status: { borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 4 },
  statusTxt: { fontSize: 12, fontWeight: '800' },
  dates: { flexDirection: 'row', gap: 12 },
  dateBox: { flex: 1, backgroundColor: colors.canvas, borderRadius: radius.md, padding: 10 },
  dateLabel: { fontSize: 11, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  dateVal: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 3 },
  meta: { fontSize: 13, color: colors.muted },

  foot: { fontSize: 12, color: colors.muted, lineHeight: 18, textAlign: 'center', marginTop: 4 },

  addBtn: { borderWidth: 1.5, borderColor: colors.brand, borderStyle: 'dashed', borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center' },
  addBtnTxt: { fontSize: 15, fontWeight: '700', color: colors.brand },
  kindTxt: { fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ownerTag: { fontSize: 12, fontWeight: '700', color: colors.brand, backgroundColor: '#F1ECF5', borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
  removeTxt: { fontSize: 13, fontWeight: '700', color: colors.red },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.canvas, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 12, maxHeight: '90%' },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  segment: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 4, gap: 4 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' },
  segBtnOn: { backgroundColor: colors.brand },
  segTxt: { fontSize: 14, fontWeight: '600', color: colors.text },
  segTxtOn: { color: colors.white },
  label: { fontSize: 15, fontWeight: '700', color: colors.text },
  sugRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sug: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 7 },
  sugOn: { borderColor: colors.brand, backgroundColor: '#F1ECF5' },
  sugTxt: { fontSize: 13, fontWeight: '500', color: colors.text },
  sugTxtOn: { color: colors.brand, fontWeight: '700' },
  input: { backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border },
  dateRow: { flexDirection: 'row', gap: 8 },
  todayBtn: { justifyContent: 'center', paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: '#F1ECF5' },
  todayTxt: { fontSize: 14, fontWeight: '700', color: colors.brand },
  hint: { fontSize: 13, color: colors.muted },
  saveBtn: { backgroundColor: colors.brand, paddingVertical: 16, borderRadius: radius.full, alignItems: 'center', marginTop: 4 },
  saveTxt: { color: colors.white, fontSize: 16, fontWeight: '800' },
});
