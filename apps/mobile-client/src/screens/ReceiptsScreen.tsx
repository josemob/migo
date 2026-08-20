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
import { cardShadow, colors, radius } from '../theme';

interface Receipt {
  id: string;
  number: string;
  concept: string;
  amountUsd: number;
  source: 'APP' | 'MANUAL';
  paymentMethod?: string | null;
  issuedAt: string;
  clinicName?: string | null;
  petName?: string | null;
}

const money = (n: number) => `$${n.toFixed(2)}`;
const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });

// HTML del recibo para generar el PDF (marca Migo).
function receiptHtml(r: Receipt): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#64748B;font-size:14px">${label}</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#1E293B">${value}</td></tr>`;
  return `<html><body style="font-family:Helvetica,Arial,sans-serif;color:#1E293B;margin:0;padding:32px">
    <div style="text-align:center;margin-bottom:20px">
      <div style="display:inline-block;width:52px;height:52px;line-height:52px;border-radius:14px;background:#8A2FA0;color:#fff;font-size:26px;font-weight:800">M</div>
      <div style="font-size:22px;font-weight:800;margin-top:8px">Recibo de pago</div>
      <div style="color:#94A3B8;font-size:13px">Migo · Cuidamos a quien más quieres</div>
    </div>
    <div style="border:1px solid #E2E8F0;border-radius:14px;padding:20px">
      <div style="font-size:13px;color:#94A3B8">Recibo</div>
      <div style="font-size:20px;font-weight:800;color:#8A2FA0;margin-bottom:14px">${r.number}</div>
      <table style="width:100%;border-collapse:collapse">
        ${row('Concepto', r.concept)}
        ${r.petName ? row('Mascota', r.petName) : ''}
        ${r.clinicName ? row('Clínica', r.clinicName) : ''}
        ${row('Fecha', longDate(r.issuedAt))}
        ${r.paymentMethod ? row('Método', r.paymentMethod) : ''}
      </table>
      <div style="border-top:1px solid #E2E8F0;margin-top:14px;padding-top:14px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:15px;color:#64748B">Total pagado</span>
        <span style="font-size:24px;font-weight:800;color:#8A2FA0">${money(r.amountUsd)}</span>
      </div>
    </div>
    <p style="text-align:center;color:#94A3B8;font-size:12px;margin-top:18px">Comprobante generado por Migo. No es un documento fiscal.</p>
  </body></html>`;
}

export default function ReceiptsScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const [busyId, setBusyId] = useState<string | null>(null);
  const receipts = useQuery({ queryKey: ['my-receipts'], queryFn: () => api<{ data: Receipt[] }>('/me/receipts') });

  const sharePdf = async (r: Receipt) => {
    try {
      setBusyId(r.id);
      const { uri } = await Print.printToFileAsync({ html: receiptHtml(r) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Recibo ${r.number}`, UTI: 'com.adobe.pdf' });
      } else {
        appAlert('Recibo', `PDF generado en: ${uri}`);
      }
    } catch (e) {
      appAlert('No se pudo generar el PDF', e instanceof Error ? e.message : 'Intenta de nuevo');
    } finally {
      setBusyId(null);
    }
  };

  const list = receipts.data?.data ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>Mis recibos</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 34 }} showsVerticalScrollIndicator={false}>
        {receipts.isLoading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🧾</Text>
            <Text style={styles.emptyTxt}>Aún no tienes recibos. Cuando pagues un servicio o la clínica te emita uno, aparecerá aquí.</Text>
          </View>
        ) : (
          list.map((r) => (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.concept} numberOfLines={2}>{r.concept}</Text>
                  <Text style={styles.meta}>{r.clinicName ?? 'Migo'}{r.petName ? ` · ${r.petName}` : ''}</Text>
                  <Text style={styles.metaSm}>{longDate(r.issuedAt)} · {r.number}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={styles.amount}>{money(r.amountUsd)}</Text>
                  <View style={[styles.badge, { backgroundColor: r.source === 'APP' ? '#DFF3E6' : '#EEF1F5' }]}>
                    <Text style={[styles.badgeTxt, { color: r.source === 'APP' ? colors.green : colors.muted }]}>{r.source === 'APP' ? 'App' : 'Clínica'}</Text>
                  </View>
                </View>
              </View>
              <Pressable style={styles.pdfBtn} onPress={() => sharePdf(r)} disabled={busyId === r.id}>
                {busyId === r.id ? (
                  <ActivityIndicator color={colors.brand} size="small" />
                ) : (
                  <>
                    <TabIcon name="share" color={colors.brand} size={18} />
                    <Text style={styles.pdfBtnTxt}>Descargar / compartir PDF</Text>
                  </>
                )}
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },

  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, marginBottom: 12, boxShadow: cardShadow },
  cardTop: { flexDirection: 'row', gap: 12 },
  concept: { fontSize: 16, fontWeight: '800', color: colors.text },
  meta: { fontSize: 14, color: colors.muted, marginTop: 4 },
  metaSm: { fontSize: 12, color: colors.muted, marginTop: 2 },
  amount: { fontSize: 20, fontWeight: '900', color: colors.brand },
  badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  badgeTxt: { fontSize: 11, fontWeight: '800' },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, borderWidth: 1.5, borderColor: colors.brand, borderRadius: radius.md, paddingVertical: 11 },
  pdfBtnTxt: { color: colors.brand, fontWeight: '800', fontSize: 14 },

  empty: { alignItems: 'center', gap: 12, paddingVertical: 50, paddingHorizontal: 20 },
  emptyIcon: { fontSize: 40 },
  emptyTxt: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
