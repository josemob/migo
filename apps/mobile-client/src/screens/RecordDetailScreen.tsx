import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { BackButton } from '../components/BackButton';
import { TabIcon } from '../components/TabIcon';
import { colors, radius } from '../theme';

interface Rx { drug: string; dose?: string | null; frequency?: string | null; durationDays?: number | null; instructions?: string | null }
interface RecordDetail {
  id: string;
  visitedAt: string;
  reason?: string | null;
  symptoms?: string | null;
  diagnosis?: string | null;
  treatment?: string | null;
  notes?: string | null;
  weightKg?: number | null;
  temperature?: number | null;
  signedAt?: string | null;
  vetName?: string | null;
  vetSpecialty?: string | null;
  vetLicense?: string | null;
  clinicName?: string | null;
  petName?: string | null;
  petBreed?: string | null;
  prescriptions: Rx[];
}

const longDate = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });

function recordHtml(r: RecordDetail): string {
  const block = (t: string, v?: string | null) => (v ? `<div style="margin-bottom:12px"><div style="font-size:12px;color:#94A3B8;text-transform:uppercase;letter-spacing:.4px">${t}</div><div style="font-size:15px;color:#1E293B;margin-top:2px">${v}</div></div>` : '');
  const rx = r.prescriptions.length
    ? `<div style="font-size:12px;color:#94A3B8;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Récipe</div>` +
      r.prescriptions.map((p) => `<div style="border:1px solid #E2E8F0;border-radius:10px;padding:10px;margin-bottom:8px"><b>${p.drug}</b>${p.dose ? ` · ${p.dose}` : ''}${p.frequency ? ` · ${p.frequency}` : ''}${p.durationDays ? ` · ${p.durationDays} días` : ''}${p.instructions ? `<div style="color:#64748B;font-size:13px;margin-top:3px">${p.instructions}</div>` : ''}</div>`).join('')
    : '';
  const sign = r.signedAt
    ? `<div style="margin-top:22px;border-top:1px solid #E2E8F0;padding-top:14px"><div style="font-size:13px;color:#2EA84F;font-weight:700">✓ Firmado digitalmente</div><div style="font-size:14px;color:#1E293B;margin-top:2px">${r.vetName ?? 'Médico veterinario'}${r.vetSpecialty ? ` · ${r.vetSpecialty}` : ''}${r.vetLicense ? ` · Colegiado #${r.vetLicense}` : ''}</div><div style="font-size:12px;color:#94A3B8">${longDate(r.signedAt)}${r.clinicName ? ` · ${r.clinicName}` : ''}</div></div>`
    : `<div style="margin-top:22px;font-size:12px;color:#94A3B8">Informe sin firma.</div>`;
  return `<html><body style="font-family:Helvetica,Arial,sans-serif;color:#1E293B;margin:0;padding:32px">
    <div style="text-align:center;margin-bottom:18px">
      <div style="display:inline-block;width:48px;height:48px;line-height:48px;border-radius:14px;background:#8A2FA0;color:#fff;font-size:24px;font-weight:800">M</div>
      <div style="font-size:20px;font-weight:800;margin-top:8px">Informe de consulta</div>
      <div style="color:#94A3B8;font-size:13px">${r.petName ?? ''}${r.petBreed ? ` · ${r.petBreed}` : ''} · ${longDate(r.visitedAt)}</div>
    </div>
    <div style="border:1px solid #E2E8F0;border-radius:14px;padding:20px">
      ${block('Motivo', r.reason)}
      ${block('Síntomas', r.symptoms)}
      ${block('Diagnóstico', r.diagnosis)}
      ${block('Tratamiento', r.treatment)}
      ${block('Peso', r.weightKg != null ? `${r.weightKg} kg` : null)}
      ${block('Temperatura', r.temperature != null ? `${r.temperature} °C` : null)}
      ${block('Notas', r.notes)}
      ${rx}
      ${sign}
    </div>
    <p style="text-align:center;color:#94A3B8;font-size:12px;margin-top:16px">Generado por Migo.</p>
  </body></html>`;
}

export default function RecordDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['record', id], queryFn: () => api<RecordDetail>(`/me/records/${id}`) });

  const sharePdf = async () => {
    if (!data) return;
    try {
      setBusy(true);
      const { uri } = await Print.printToFileAsync({ html: recordHtml(data) });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Informe de consulta', UTI: 'com.adobe.pdf' });
      else appAlert('Informe', `PDF generado en: ${uri}`);
    } catch (e) {
      appAlert('No se pudo generar el PDF', e instanceof Error ? e.message : 'Intenta de nuevo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>Consulta</Text>
        <View style={{ width: 44 }} />
      </View>

      {isLoading || !data ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 34 }} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <Text style={styles.reason}>{data.reason ?? 'Consulta'}</Text>
            <Text style={styles.meta}>{longDate(data.visitedAt)}{data.clinicName ? ` · ${data.clinicName}` : ''}</Text>
            {data.signedAt ? (
              <View style={styles.signed}>
                <Text style={styles.signedTxt}>✓ Firmado por {data.vetName ?? 'el veterinario'}{data.vetSpecialty ? ` · ${data.vetSpecialty}` : ''}{data.vetLicense ? ` · Colegiado #${data.vetLicense}` : ''}</Text>
              </View>
            ) : (
              <View style={styles.draft}><Text style={styles.draftTxt}>Informe sin firmar</Text></View>
            )}
          </View>

          {[
            ['Síntomas', data.symptoms],
            ['Diagnóstico', data.diagnosis],
            ['Tratamiento', data.treatment],
            ['Notas', data.notes],
          ].filter(([, v]) => v).map(([t, v]) => (
            <View key={t as string} style={styles.block}>
              <Text style={styles.blockTitle}>{t}</Text>
              <Text style={styles.blockTxt}>{v}</Text>
            </View>
          ))}

          {(data.weightKg != null || data.temperature != null) && (
            <View style={styles.vitals}>
              {data.weightKg != null && <View style={styles.vital}><Text style={styles.vitalV}>{data.weightKg} kg</Text><Text style={styles.vitalL}>Peso</Text></View>}
              {data.temperature != null && <View style={styles.vital}><Text style={styles.vitalV}>{data.temperature} °C</Text><Text style={styles.vitalL}>Temp.</Text></View>}
            </View>
          )}

          {data.prescriptions.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Récipe</Text>
              {data.prescriptions.map((p, i) => (
                <View key={i} style={styles.rx}>
                  <Text style={styles.rxDrug}>{p.drug}</Text>
                  <Text style={styles.rxSub}>{[p.dose, p.frequency, p.durationDays ? `${p.durationDays} días` : null].filter(Boolean).join(' · ')}</Text>
                  {p.instructions ? <Text style={styles.rxNote}>{p.instructions}</Text> : null}
                </View>
              ))}
            </View>
          )}

          <Pressable style={styles.pdfBtn} onPress={sharePdf} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.white} size="small" /> : (
              <>
                <TabIcon name="share" color={colors.white} size={18} />
                <Text style={styles.pdfBtnTxt}>Descargar / compartir PDF</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, marginBottom: 12 },
  reason: { fontSize: 18, fontWeight: '900', color: colors.text },
  meta: { fontSize: 14, color: colors.muted, marginTop: 4 },
  signed: { marginTop: 10, backgroundColor: '#DFF3E6', borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  signedTxt: { color: colors.green, fontWeight: '800', fontSize: 13 },
  draft: { marginTop: 10, backgroundColor: '#EEF1F5', borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  draftTxt: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  block: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, marginBottom: 12 },
  blockTitle: { fontSize: 13, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  blockTxt: { fontSize: 15, color: colors.text, lineHeight: 21 },
  vitals: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  vital: { flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, alignItems: 'center' },
  vitalV: { fontSize: 18, fontWeight: '900', color: colors.brand },
  vitalL: { fontSize: 12, color: colors.muted, marginTop: 2 },
  rx: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginTop: 8 },
  rxDrug: { fontSize: 15, fontWeight: '800', color: colors.text },
  rxSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  rxNote: { fontSize: 13, color: colors.text, marginTop: 4 },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6, backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 13 },
  pdfBtnTxt: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
