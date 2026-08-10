import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { TabIcon } from '../components/TabIcon';
import { BackButton } from '../components/BackButton';
import { cardShadow, colors, radius } from '../theme';

interface Service { id: string; name: string; priceUsd: string | number }

const MIGO_FEE = 1.5;
const BCV = 36.5;
const PAGO_MOVIL = { banco: 'Banesco (0134)', rif: 'J-500000000', telefono: '0412-0000000' };

export default function ConfirmPayScreen({ navigation, route }: any) {
  const p = route.params as {
    clinicId: string; clinicName: string; service: Service;
    petId: string; petName: string; scheduledAt: string;
    dayLabel: string; timeLabel: string;
  };
  const base = Number(p.service.priceUsd);
  const total = base + MIGO_FEE;
  const insets = useSafeAreaInsets();

  const [method, setMethod] = useState<'PM' | 'DEBIT'>('PM');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(`${PAGO_MOVIL.banco} · RIF ${PAGO_MOVIL.rif} · Tel ${PAGO_MOVIL.telefono} · $${total.toFixed(2)}`);
    appAlert('Copiado', 'Datos de Pago Móvil copiados al portapapeles.');
  };

  const process = async () => {
    if (method === 'PM' && reference.trim().length < 4) {
      return appAlert('Falta la referencia', 'Ingresa el número de referencia de tu Pago Móvil.');
    }
    setBusy(true);
    try {
      await api('/me/appointments', {
        method: 'POST',
        body: {
          clinicId: p.clinicId,
          petId: p.petId,
          serviceId: p.service.id,
          scheduledAt: p.scheduledAt,
          paid: true,
          paymentRef: method === 'PM' ? reference.trim() : undefined,
        },
      });
      setDone(true);
    } catch (e) {
      appAlert('No se pudo confirmar', e instanceof Error ? e.message : 'Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const goHome = () => navigation.navigate('Tabs', { screen: 'Home' });

  if (done) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.successWrap}>
          <View style={styles.check}><Text style={styles.checkMark}>✓</Text></View>
          <Text style={styles.successTitle}>¡Reserva confirmada!</Text>
          <Text style={styles.successSub}>Tu cita para {p.petName} quedó agendada.</Text>

          <View style={styles.successCard}>
            <Row icon="medical" text={p.clinicName} bold />
            <Divider />
            <Row icon="scissors" text={p.service.name} />
            <Row icon="calendar" text={`${p.dayLabel} · ${p.timeLabel}`} />
          </View>

          <View style={{ width: '100%', gap: 12, marginTop: 24 }}>
            <Pressable style={styles.cta} onPress={goHome}>
              <Text style={styles.ctaText}>Volver al inicio</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topbar}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.topTitle}>Confirmar y Pagar</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 20 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Resumen */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Resumen de la cita</Text>
          <Row icon="medical" text={p.clinicName} />
          <Row icon="scissors" text={`${p.service.name} (Mascota: ${p.petName})`} />
          <Row icon="calendar" text={`${p.dayLabel} · ${p.timeLabel}`} />
        </View>

        {/* Método de pago */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Método de pago</Text>
          <PayOption label="Pago Móvil" on={method === 'PM'} onPress={() => setMethod('PM')} />
          <PayOption label="Débito Inmediato" on={method === 'DEBIT'} onPress={() => setMethod('DEBIT')} />
        </View>

        {method === 'PM' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pago Móvil</Text>
            <View style={styles.pmGrid}>
              <PMField label="Banco" value={PAGO_MOVIL.banco} />
              <PMField label="RIF" value={PAGO_MOVIL.rif} />
              <PMField label="Teléfono" value={PAGO_MOVIL.telefono} />
            </View>
            <Pressable style={styles.copyBtn} onPress={copy}>
              <Text style={styles.copyText}>⧉  Copiar datos de Pago Móvil</Text>
            </Pressable>
            <Text style={styles.refLabel}>Ingrese N° de Referencia:</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej. 123456"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              value={reference}
              onChangeText={setReference}
            />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Débito Inmediato</Text>
            <Text style={styles.debitNote}>Se debitará el total de tu cuenta afiliada al confirmar el pago.</Text>
          </View>
        )}

        {/* Desglose */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Desglose de monto</Text>
          <View style={styles.brk}><Text style={styles.brkLabel}>Servicio Base</Text><Text style={styles.brkVal}>${base.toFixed(2)}</Text></View>
          <View style={styles.brk}><Text style={styles.brkLabel}>Tarifa de Servicio Migo</Text><Text style={styles.brkVal}>${MIGO_FEE.toFixed(2)}</Text></View>
          <Divider />
          <View style={styles.brk}>
            <Text style={styles.totalLabel}>Total a pagar</Text>
            <Text style={styles.totalVal}>${total.toFixed(2)} USD</Text>
          </View>
          <Text style={styles.bcv}>Tasa BCV: {BCV.toFixed(2)} BS/USD · Total: {(total * BCV).toFixed(2)} BS</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <Pressable style={[styles.cta, busy && { opacity: 0.5 }]} disabled={busy} onPress={process}>
          <Text style={styles.ctaText}>{busy ? 'Procesando…' : 'Procesar y confirmar pago'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Row({ icon, text, bold }: { icon: string; text: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <TabIcon name={icon} color={colors.brand} size={18} />
      <Text style={[styles.rowText, bold && { fontWeight: '800' }]}>{text}</Text>
    </View>
  );
}
function Divider() {
  return <View style={styles.divider} />;
}
function PayOption({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.payOpt} onPress={onPress}>
      <View style={[styles.radio, on && styles.radioOn]}>{on && <Text style={styles.radioDot}>✓</Text>}</View>
      <Text style={styles.payLabel}>{label}</Text>
    </Pressable>
  );
}
function PMField({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: '45%' }}>
      <Text style={styles.pmLabel}>{label}</Text>
      <Text style={styles.pmValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  topbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  back: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', boxShadow: cardShadow },
  backArrow: { fontSize: 30, color: colors.brand, marginTop: -4, fontWeight: '700' },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },

  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, marginBottom: 14, boxShadow: cardShadow },
  cardTitle: { fontSize: 13, fontWeight: '800', color: colors.muted, letterSpacing: 0.4, marginBottom: 12, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  rowText: { fontSize: 15, color: colors.text, fontWeight: '600', flex: 1 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },

  payOpt: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.brand, backgroundColor: colors.brand },
  radioDot: { color: colors.white, fontSize: 13, fontWeight: '900' },
  payLabel: { fontSize: 16, fontWeight: '700', color: colors.text },

  pmGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 14 },
  pmLabel: { fontSize: 12, color: colors.muted, fontWeight: '700' },
  pmValue: { fontSize: 15, color: colors.text, fontWeight: '800', marginTop: 2 },
  copyBtn: { borderWidth: 1.5, borderColor: colors.brand, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', marginBottom: 14 },
  copyText: { color: colors.brand, fontWeight: '800', fontSize: 14 },
  refLabel: { fontSize: 13, fontWeight: '700', color: colors.muted, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text, backgroundColor: colors.white },
  debitNote: { fontSize: 14, color: colors.muted, lineHeight: 20 },

  brk: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  brkLabel: { fontSize: 14, color: colors.muted },
  brkVal: { fontSize: 14, color: colors.text, fontWeight: '700' },
  totalLabel: { fontSize: 16, fontWeight: '800', color: colors.text },
  totalVal: { fontSize: 18, fontWeight: '900', color: colors.brand },
  bcv: { fontSize: 12, color: colors.muted, marginTop: 6 },

  footer: { padding: 20, paddingTop: 10, backgroundColor: colors.canvas, borderTopWidth: 1, borderTopColor: '#EFEBF2' },
  cta: { backgroundColor: colors.brand, borderRadius: 16, height: 56, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: colors.white, fontWeight: '800', fontSize: 16 },

  // Éxito
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  check: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  checkMark: { color: colors.white, fontSize: 46, fontWeight: '900' },
  successTitle: { fontSize: 24, fontWeight: '900', color: colors.brand },
  successSub: { fontSize: 15, color: colors.muted, marginTop: 6, marginBottom: 22, textAlign: 'center' },
  successCard: { width: '100%', backgroundColor: colors.white, borderRadius: radius.lg, padding: 16, boxShadow: cardShadow },
});
