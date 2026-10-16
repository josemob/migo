import { useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import QR from 'qrcode';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { editField } from '../lib/editField';
import { printHtml, qrPayload } from '../lib/petTagPrint';
import { Loading } from '../components/ui';
import { TabIcon } from '../components/TabIcon';
import { BackButton } from '../components/BackButton';
import { cardShadow, colors, radius } from '../theme';

// Placa QR de identificación: lo que va grabado o pegado en la medalla del collar.
// Quien la escanee abre migopet.app/m/:código sin tener Migo y puede avisarle al
// dueño. El teléfono del dueño no se muestra salvo en modo extraviado y si él lo
// activa aquí.

interface Tag {
  name: string;
  code: string;
  url: string;
  lostMode: boolean;
  lostSince?: string | null;
  lostMessage?: string | null;
  showOwnerPhone: boolean;
}
interface Report {
  id: string;
  message?: string | null;
  contact?: string | null;
  lat?: number | null;
  lng?: number | null;
  createdAt: string;
  seenAt?: string | null;
}

const haceCuanto = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(iso).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' });
};
export default function PetTagScreen({ route, navigation }: { route: any; navigation: any }) {
  const { id, name } = route.params ?? {};
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<'pdf' | 'svg' | null>(null);

  // POST porque genera el código la primera vez; después devuelve siempre el mismo.
  const tag = useQuery({
    queryKey: ['pet-tag', id],
    queryFn: () => api<Tag>(`/me/pets/${id}/tag`, { method: 'POST' }),
  });
  const reports = useQuery({
    queryKey: ['pet-found', id],
    queryFn: () => api<{ data: Report[] }>(`/me/pets/${id}/found-reports`),
  });

  const setLost = useMutation({
    mutationFn: (body: { lostMode: boolean; lostMessage?: string | null; showOwnerPhone?: boolean }) =>
      api<Tag>(`/me/pets/${id}/lost`, { method: 'PATCH', body }),
    onSuccess: (t) => {
      qc.setQueryData(['pet-tag', id], t);
      qc.invalidateQueries({ queryKey: ['pet', id] });
      qc.invalidateQueries({ queryKey: ['pets'] });
    },
    onError: (e) => appAlert('No se pudo guardar', e instanceof Error ? e.message : 'Intenta de nuevo'),
  });

  if (tag.isLoading) return <Loading />;
  if (tag.isError || !tag.data) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header title="Placa QR" onBack={() => navigation.goBack()} />
        <View style={{ padding: 20, gap: 12 }}>
          <Text style={styles.muted}>{tag.error instanceof Error ? tag.error.message : 'No pudimos cargar la placa.'}</Text>
          <Pressable style={styles.outlineBtn} onPress={() => void tag.refetch()}>
            <Text style={styles.outlineBtnTxt}>Reintentar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const t = tag.data;
  // Desde el push solo llega el id: el nombre lo trae el propio endpoint de la placa.
  const petName = name ?? t.name ?? 'tu mascota';
  const list = reports.data?.data ?? [];

  const svgString = (opts: { margin: number; light: string }) =>
    QR.toString(qrPayload(t.url), {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: opts.margin,
      color: { dark: '#000000', light: opts.light },
    });

  const imprimir = async () => {
    try {
      setBusy('pdf');
      const svg = await svgString({ margin: 1, light: '#ffffff' });
      const { uri } = await Print.printToFileAsync({ html: printHtml(petName, t.code, svg) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Placa de ${petName}`, UTI: 'com.adobe.pdf' });
      } else {
        appAlert('Placa', `PDF generado en: ${uri}`);
      }
    } catch (e) {
      appAlert('No se pudo generar el PDF', e instanceof Error ? e.message : 'Intenta de nuevo');
    } finally {
      setBusy(null);
    }
  };

  // Para grabado láser: vector puro, negro sobre transparente (el láser solo graba
  // lo oscuro) y con el margen estándar de 4 módulos alrededor.
  const exportarSvg = async () => {
    try {
      setBusy('svg');
      const svg = await svgString({ margin: 4, light: '#ffffff00' });
      const file = new File(Paths.cache, `placa-${t.code}.svg`);
      if (file.exists) file.delete();
      file.create();
      file.write(svg);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'image/svg+xml', dialogTitle: `QR de ${petName} para grabado` });
      } else {
        appAlert('Placa', `SVG guardado en: ${file.uri}`);
      }
    } catch (e) {
      appAlert('No se pudo exportar', e instanceof Error ? e.message : 'Intenta de nuevo');
    } finally {
      setBusy(null);
    }
  };

  const compartirEnlace = () =>
    Share.share({
      message: t.lostMode
        ? `${petName} se perdió. Si tienes información, avisa aquí: ${t.url}`
        : `Ficha de ${petName}: ${t.url}`,
    }).catch(() => {});

  const toggleLost = (on: boolean) => {
    if (on) {
      editField({
        title: `Mensaje para quien encuentre a ${petName} (opcional)`,
        value: t.lostMessage ?? '',
        multiline: true,
        onSave: async (v) => { await setLost.mutateAsync({ lostMode: true, lostMessage: v.trim() || null }); },
      });
    } else {
      appAlert(`¿${petName} ya está en casa?`, 'Se quita la alerta de su ficha pública y tu teléfono vuelve a ocultarse.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sí, ya volvió', onPress: () => setLost.mutate({ lostMode: false }) },
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header title={`Placa de ${petName}`} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {/* La placa */}
        <View style={[styles.placa, t.lostMode && styles.placaPerdida]}>
          {t.lostMode && (
            <View style={styles.alerta}>
              <Text style={styles.alertaTxt}>
                Se perdió{t.lostSince ? ` el ${new Date(t.lostSince).toLocaleDateString('es-VE', { day: 'numeric', month: 'long' })}` : ''}
              </Text>
            </View>
          )}
          <View style={styles.qrBox}>
            <QRCode value={qrPayload(t.url)} size={208} ecl="H" color={colors.brandDeep} backgroundColor={colors.white} />
          </View>
          <Text style={styles.code}>{t.code}</Text>
          <Text style={styles.url}>{t.url.replace(/^https?:\/\//, '')}</Text>
        </View>

        <Text style={styles.nota}>
          Quien escanee esta placa verá la foto y el nombre de {petName} y podrá avisarte al instante.{' '}
          <Text style={{ fontWeight: '700' }}>No ve tu teléfono</Text>, salvo que lo actives si se pierde.
        </Text>

        {/* Exportar */}
        <Text style={styles.section}>Llévala al collar</Text>
        <View style={styles.card}>
          <Action icon="file" label={busy === 'pdf' ? 'Generando PDF…' : 'Imprimir placa'} hint="Medallas de 25, 30 y 35 mm" onPress={imprimir} disabled={!!busy} />
          <Action icon="edit" label={busy === 'svg' ? 'Exportando…' : 'Archivo para grabado'} hint="SVG vectorial, para láser" onPress={exportarSvg} disabled={!!busy} border />
          <Action icon="share" label="Compartir enlace" hint={t.lostMode ? 'Para grupos y redes' : 'Su ficha pública'} onPress={compartirEnlace} border />
        </View>

        {/* Modo extraviado */}
        <Text style={styles.section}>Si se pierde</Text>
        <View style={[styles.card, t.lostMode && { borderWidth: 2, borderColor: colors.red }]}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>{petName} se perdió</Text>
              <Text style={styles.switchHint}>Su ficha pública muestra una alerta y lo que hay que saber mientras vuelve a casa.</Text>
            </View>
            <Switch
              value={t.lostMode}
              onValueChange={toggleLost}
              disabled={setLost.isPending}
              trackColor={{ false: '#D8CFE0', true: colors.red }}
              thumbColor={colors.white}
            />
          </View>

          {t.lostMode && (
            <>
              <Pressable
                style={[styles.switchRow, styles.border]}
                onPress={() =>
                  editField({
                    title: `Mensaje para quien encuentre a ${petName}`,
                    value: t.lostMessage ?? '',
                    multiline: true,
                    onSave: async (v) => { await setLost.mutateAsync({ lostMode: true, lostMessage: v.trim() || null }); },
                  })
                }
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchHint}>Mensaje</Text>
                  <Text style={styles.msg}>{t.lostMessage || 'Sin mensaje. Toca para escribir uno.'}</Text>
                </View>
                <TabIcon name="edit" color={colors.muted} size={16} />
              </Pressable>

              <View style={[styles.switchRow, styles.border]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Mostrar mi teléfono</Text>
                  <Text style={styles.switchHint}>Se ve el de tu perfil, con botones de llamar y WhatsApp. Se apaga solo cuando vuelva a casa.</Text>
                </View>
                <Switch
                  value={t.showOwnerPhone}
                  onValueChange={(v) => setLost.mutate({ lostMode: true, showOwnerPhone: v })}
                  disabled={setLost.isPending}
                  trackColor={{ false: '#D8CFE0', true: colors.brand }}
                  thumbColor={colors.white}
                />
              </View>
            </>
          )}
        </View>

        {/* Avisos recibidos */}
        <Text style={styles.section}>Avisos recibidos</Text>
        <View style={styles.card}>
          {list.length === 0 ? (
            <Text style={[styles.muted, { padding: 16 }]}>
              Aún no hay avisos. Cuando alguien escanee la placa y te avise, aparecerá aquí y te llegará una notificación.
            </Text>
          ) : (
            list.map((r, i) => (
              <View key={r.id} style={[styles.report, i > 0 && styles.border]}>
                <View style={styles.reportHead}>
                  {!r.seenAt && <View style={styles.dot} />}
                  <Text style={styles.reportTime}>{haceCuanto(r.createdAt)}</Text>
                </View>
                <Text style={styles.msg}>{r.message || 'Sin mensaje.'}</Text>
                <View style={styles.reportActions}>
                  {r.contact ? (
                    <Pressable style={styles.chip} onPress={() => void Linking.openURL(`tel:${r.contact!.replace(/[^\d+]/g, '')}`)}>
                      <TabIcon name="phone" color={colors.brand} size={14} />
                      <Text style={styles.chipTxt}>{r.contact}</Text>
                    </Pressable>
                  ) : null}
                  {r.lat != null && r.lng != null ? (
                    <Pressable style={styles.chip} onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`)}>
                      <TabIcon name="pin" color={colors.brand} size={14} />
                      <Text style={styles.chipTxt}>Ver en el mapa</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <BackButton onPress={onBack} />
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={{ width: 44 }} />
    </View>
  );
}

function Action({ icon, label, hint, onPress, border, disabled }: { icon: string; label: string; hint?: string; onPress: () => void; border?: boolean; disabled?: boolean }) {
  return (
    <Pressable style={[styles.action, border && styles.border, disabled && { opacity: 0.6 }]} onPress={onPress} disabled={disabled}>
      <TabIcon name={icon} color={colors.brand} size={20} />
      <View style={{ flex: 1 }}>
        <Text style={styles.actionLabel}>{label}</Text>
        {hint ? <Text style={styles.switchHint}>{hint}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },
  muted: { fontSize: 15, color: colors.muted, lineHeight: 21 },

  placa: { alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.xl, paddingVertical: 24, paddingHorizontal: 20, boxShadow: cardShadow },
  placaPerdida: { borderWidth: 2, borderColor: colors.red },
  alerta: { backgroundColor: colors.red, borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 16 },
  alertaTxt: { color: colors.white, fontWeight: '700', fontSize: 13 },
  qrBox: { padding: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: '#EFE7F4' },
  code: { marginTop: 16, fontSize: 28, fontWeight: '800', letterSpacing: 6, color: colors.brandDeep },
  url: { marginTop: 2, fontSize: 14, color: colors.muted },

  nota: { marginTop: 14, marginHorizontal: 4, fontSize: 14, lineHeight: 20, color: colors.muted },

  section: { fontSize: 15, color: colors.muted, fontWeight: '600', marginTop: 24, marginBottom: 10, marginLeft: 4 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, boxShadow: cardShadow, overflow: 'hidden' },
  border: { borderTopWidth: 1, borderTopColor: '#F0ECF3' },

  action: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  actionLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  chevron: { fontSize: 24, color: '#C9BBD3' },

  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  switchLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  switchHint: { fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 18 },
  msg: { fontSize: 15, color: colors.text, marginTop: 3, lineHeight: 21 },

  report: { padding: 16, gap: 4 },
  reportHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red },
  reportTime: { fontSize: 13, fontWeight: '600', color: colors.muted },
  reportActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.brandLight, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 7 },
  chipTxt: { fontSize: 14, fontWeight: '600', color: colors.brandDeep },

  outlineBtn: { height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  outlineBtnTxt: { color: colors.brand, fontSize: 16, fontWeight: '800' },
});
