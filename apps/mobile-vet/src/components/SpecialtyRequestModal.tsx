import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../lib/api';
import { appAlert } from '../lib/dialog';
import { capturePhotoAsDataUri, pickPhotoAsDataUri, pickDocumentAsDataUri } from '../lib/photo';
import { Button } from './ui';
import { SpecialtyPicker } from './SpecialtyPicker';
import { TabIcon } from './TabIcon';
import { colors, radius } from '../theme';

interface DocItem { type: string; label: string; url: string }
const DOC_TYPES = ['Carnet CMV', 'Postgrado', 'Diplomado', 'Otro'];

/**
 * Solicitud de cambio de especialidades: elige hasta 3 + adjunta documentos que las
 * avalen (foto o PDF). Al enviar queda PENDIENTE de aprobación del Super Admin.
 */
export function SpecialtyRequestModal({
  visible,
  initialSpecialty,
  onClose,
  onSubmitted,
}: {
  visible: boolean;
  initialSpecialty: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [specialty, setSpecialty] = useState(initialSpecialty);
  const [docType, setDocType] = useState('Postgrado');
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const add = (url: string | null, label: string) => {
    if (!url) return;
    setDocs((d) => [...d, { type: docType, label, url }]);
  };

  const addPdf = async () => {
    const doc = await pickDocumentAsDataUri();
    if (doc) setDocs((d) => [...d, { type: docType, label: doc.name, url: doc.url }]);
  };

  const submit = async () => {
    setError('');
    if (!specialty.trim()) return setError('Selecciona al menos una especialidad');
    if (docs.length === 0) return setError('Adjunta al menos un documento que avale tu especialidad');
    setBusy(true);
    try {
      await api('/me/specialty-request', { method: 'POST', body: { specialty: specialty.trim(), documents: docs } });
      onSubmitted();
      onClose();
      appAlert('Solicitud enviada', 'Tu cambio de especialidades se aplicará una vez que el Super Admin apruebe los documentos.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar la solicitud.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Editar especialidades</Text>
            <Text style={styles.sub}>Elige hasta 3 y adjunta los documentos que las avalen. El cambio pasa por aprobación del Super Admin.</Text>

            <Text style={styles.label}>Especialidades</Text>
            <SpecialtyPicker value={specialty} onChange={setSpecialty} />

            <Text style={styles.label}>Tipo de documento</Text>
            <View style={styles.chips}>
              {DOC_TYPES.map((t) => {
                const on = docType === t;
                return (
                  <Pressable key={t} style={[styles.chip, on && styles.chipOn]} onPress={() => setDocType(t)}>
                    <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.addRow}>
              <Pressable style={styles.addBtn} onPress={async () => add(await capturePhotoAsDataUri({ aspect: [16, 10] }), 'Foto')}>
                <TabIcon name="camera" color={colors.brandDark} size={18} />
                <Text style={styles.addTxt}>Foto</Text>
              </Pressable>
              <Pressable style={styles.addBtn} onPress={async () => add(await pickPhotoAsDataUri([16, 10]), 'Imagen')}>
                <TabIcon name="image" color={colors.brandDark} size={18} />
                <Text style={styles.addTxt}>Galería</Text>
              </Pressable>
              <Pressable style={styles.addBtn} onPress={addPdf}>
                <TabIcon name="file" color={colors.brandDark} size={18} />
                <Text style={styles.addTxt}>Archivo</Text>
              </Pressable>
            </View>

            {docs.length > 0 && (
              <View style={styles.docList}>
                {docs.map((d, i) => (
                  <View key={i} style={styles.docRow}>
                    <Text style={styles.docTxt} numberOfLines={1}>{d.type} · {d.label}</Text>
                    <Pressable onPress={() => setDocs((arr) => arr.filter((_, idx) => idx !== i))}><Text style={styles.docDel}>✕</Text></Pressable>
                  </View>
                ))}
              </View>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={{ marginTop: 14, gap: 8 }}>
              <Button title={busy ? 'Enviando…' : 'Enviar para aprobación'} onPress={submit} loading={busy} />
              <Pressable onPress={onClose} style={styles.cancelBtn}><Text style={styles.cancel}>Cancelar</Text></Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.canvas, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 24, paddingBottom: 34, maxHeight: '90%' },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 6, marginBottom: 8, lineHeight: 19 },
  label: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 16, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontSize: 14, color: colors.text },
  chipTxtOn: { color: colors.white, fontWeight: '700' },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  addBtn: { flex: 1, flexDirection: 'row', gap: 6, backgroundColor: colors.brandLight, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  addTxt: { color: colors.brandDark, fontWeight: '700', fontSize: 13 },
  docList: { marginTop: 12, gap: 8 },
  docRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: colors.white, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border },
  docTxt: { flex: 1, fontSize: 14, color: colors.text },
  docDel: { fontSize: 16, color: colors.red, fontWeight: '800', paddingHorizontal: 6 },
  error: { color: colors.red, fontSize: 14, marginTop: 10 },
  cancelBtn: { paddingVertical: 10, alignItems: 'center' },
  cancel: { color: colors.muted, fontWeight: '700', fontSize: 15 },
});
