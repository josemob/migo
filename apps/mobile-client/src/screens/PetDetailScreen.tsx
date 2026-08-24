import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { Badge, Button, Card, Loading, Muted, Screen } from '../components/ui';
import { colors } from '../theme';

interface Ficha {
  name: string;
  breed?: string;
  bloodType?: string;
  weightKg?: string;
  allergies: { substance: string }[];
  conditions: { name: string }[];
  vaccinations: { vaccineName: string; nextDueAt?: string }[];
  prescriptions: { drug: string; frequency?: string }[];
  records: { id: string; visitedAt: string; reason?: string; signedAt?: string | null; clinic?: { name: string } }[];
}

interface AiSummary {
  id: string;
  consultationReason: string;
  symptoms: string[];
  durationOfSymptoms?: string | null;
  perceivedUrgency: 'CRITICA' | 'MODERADA' | 'BAJA';
  recommendedAction: string;
  createdAt: string;
}

const URGENCY: Record<AiSummary['perceivedUrgency'], { label: string; color: string }> = {
  CRITICA: { label: 'Crítica', color: colors.red },
  MODERADA: { label: 'Moderada', color: colors.amber },
  BAJA: { label: 'Baja', color: colors.green },
};

export default function PetDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const { id } = route.params;
  const [exporting, setExporting] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['pet', id], queryFn: () => api<Ficha>(`/me/pets/${id}`) });
  const ai = useQuery({ queryKey: ['pet-ai', id], queryFn: () => api<{ data: AiSummary[] }>(`/me/pets/${id}/chat-summaries`) });

  const exportPdf = async () => {
    if (!data) return;
    try {
      setExporting(true);
      const { uri } = await Print.printToFileAsync({ html: expedienteHtml(data) });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Expediente de ${data.name}`, UTI: 'com.adobe.pdf' });
      else appAlert('Expediente', `PDF generado en: ${uri}`);
    } catch (e) {
      appAlert('No se pudo exportar', e instanceof Error ? e.message : 'Intenta de nuevo');
    } finally {
      setExporting(false);
    }
  };

  if (isLoading || !data) return <Loading />;
  const upToDate = (d?: string) => !d || new Date(d) > new Date();

  return (
    <Screen>
      <Card style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ fontSize: 48 }}>🐕</Text>
        <Text style={styles.name}>{data.name}</Text>
        <Muted>{data.breed}{data.weightKg ? ` · ${data.weightKg} kg` : ''}{data.bloodType ? ` · ${data.bloodType}` : ''}</Muted>
      </Card>

      {data.allergies.length > 0 && (
        <Card>
          <Text style={styles.section}>Alergias conocidas</Text>
          <View style={styles.row}>
            {data.allergies.map((a, i) => (
              <Badge key={i} text={a.substance} color={colors.red} />
            ))}
          </View>
        </Card>
      )}

      {data.conditions.length > 0 && (
        <Card>
          <Text style={styles.section}>Preexistencias</Text>
          {data.conditions.map((c, i) => (
            <Text key={i} style={styles.item}>• {c.name}</Text>
          ))}
        </Card>
      )}

      <Card>
        <Text style={styles.section}>Esquema de vacunación</Text>
        {data.vaccinations.length === 0 && <Muted>Sin vacunas registradas.</Muted>}
        {data.vaccinations.map((v, i) => (
          <View key={i} style={styles.vaxRow}>
            <Text style={styles.item}>{v.vaccineName}</Text>
            <Badge text={upToDate(v.nextDueAt) ? 'Al día' : 'Vencida'} color={upToDate(v.nextDueAt) ? colors.green : colors.red} />
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.section}>Historial de visitas</Text>
        {data.records.length === 0 && <Muted>Sin visitas registradas.</Muted>}
        {data.records.map((r) => (
          <Pressable key={r.id} style={styles.visit} onPress={() => navigation.navigate('RecordDetail', { id: r.id })}>
            <View style={{ flex: 1 }}>
              <View style={styles.visitTop}>
                <Text style={styles.item}>{r.reason ?? 'Consulta'}</Text>
                {r.signedAt ? <Badge text="Firmado" color={colors.green} /> : null}
              </View>
              <Muted>
                {new Date(r.visitedAt).toLocaleDateString('es-VE')} {r.clinic ? `· ${r.clinic.name}` : ''}
              </Muted>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </Card>

      {/* Consultas con Migo IA (resúmenes guardados del chat) */}
      <Card>
        <Text style={styles.section}>Consultas con Migo IA</Text>
        {!ai.data?.data.length ? (
          <Muted>Aún no hay consultas con Migo IA. Cuéntale los síntomas de tu mascota en el chat y se guardarán aquí.</Muted>
        ) : (
          ai.data.data.map((s) => (
            <View key={s.id} style={styles.aiItem}>
              <View style={styles.aiHead}>
                <Text style={styles.aiReason} numberOfLines={2}>{s.consultationReason}</Text>
                <Badge text={URGENCY[s.perceivedUrgency].label} color={URGENCY[s.perceivedUrgency].color} />
              </View>
              <Muted>
                {new Date(s.createdAt).toLocaleDateString('es-VE')}
                {s.durationOfSymptoms ? ` · ${s.durationOfSymptoms}` : ''}
              </Muted>
              {s.symptoms.length > 0 && <Text style={styles.aiSymptoms}>🔎 {s.symptoms.join(', ')}</Text>}
              <Text style={styles.aiAction}>💡 {s.recommendedAction}</Text>
            </View>
          ))
        )}
      </Card>

      <Button
        title={exporting ? 'Generando PDF…' : 'Exportar expediente médico (PDF)'}
        variant="outline"
        loading={exporting}
        onPress={exportPdf}
      />
    </Screen>
  );
}

// PDF del expediente completo (resumen) para compartir/descargar.
function expedienteHtml(d: Ficha): string {
  const sec = (t: string, inner: string) => `<div style="margin-top:16px"><div style="font-size:13px;font-weight:800;color:#8A2FA0;margin-bottom:6px">${t}</div>${inner}</div>`;
  const li = (t: string) => `<div style="font-size:14px;color:#1E293B;padding:3px 0">• ${t}</div>`;
  const visits = d.records.length
    ? d.records.map((r) => `<div style="font-size:14px;padding:4px 0;border-top:1px solid #EEE">${r.reason ?? 'Consulta'} <span style="color:#94A3B8">— ${new Date(r.visitedAt).toLocaleDateString('es-VE')}${r.clinic ? ` · ${r.clinic.name}` : ''}${r.signedAt ? ' · ✓ firmado' : ''}</span></div>`).join('')
    : '<div style="color:#94A3B8;font-size:14px">Sin visitas.</div>';
  return `<html><body style="font-family:Helvetica,Arial,sans-serif;color:#1E293B;margin:0;padding:32px">
    <div style="text-align:center;margin-bottom:14px">
      <div style="display:inline-block;width:48px;height:48px;line-height:48px;border-radius:14px;background:#8A2FA0;color:#fff;font-size:24px;font-weight:800">M</div>
      <div style="font-size:22px;font-weight:800;margin-top:8px">Expediente médico</div>
      <div style="color:#94A3B8;font-size:13px">${d.name}${d.breed ? ` · ${d.breed}` : ''}${d.weightKg ? ` · ${d.weightKg} kg` : ''}</div>
    </div>
    <div style="border:1px solid #E2E8F0;border-radius:14px;padding:20px">
      ${d.allergies.length ? sec('Alergias', d.allergies.map((a) => li(a.substance)).join('')) : ''}
      ${d.conditions.length ? sec('Preexistencias', d.conditions.map((c) => li(c.name)).join('')) : ''}
      ${d.vaccinations.length ? sec('Vacunación', d.vaccinations.map((v) => li(v.vaccineName)).join('')) : ''}
      ${sec('Historial de visitas', visits)}
    </div>
    <p style="text-align:center;color:#94A3B8;font-size:12px;margin-top:16px">Generado por Migo. Resumen del expediente.</p>
  </body></html>`;
}

const styles = StyleSheet.create({
  name: { fontSize: 24, fontWeight: '800', color: colors.text },
  section: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { fontSize: 15, color: colors.text },
  vaxRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  visit: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  visitTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chevron: { fontSize: 24, color: '#C9BBD3' },
  aiItem: { paddingVertical: 10, gap: 4, borderTopWidth: 1, borderTopColor: colors.border },
  aiHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  aiReason: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  aiSymptoms: { fontSize: 14, color: colors.text, marginTop: 2 },
  aiAction: { fontSize: 14, color: colors.muted, marginTop: 2 },
});

