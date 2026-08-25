import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { appAlert } from '../lib/dialog';
import { colors, radius, type } from '../theme';
import { VET_SPECIALTIES, OTHER_SPECIALTY } from '../lib/specialties';

const KNOWN = VET_SPECIALTIES as readonly string[];

/**
 * Selector de especialidades: multi-selección (hasta `max`, por defecto 3) de la
 * taxonomía estándar + "Otra" (una especialidad libre). `value` es un string con las
 * especialidades separadas por coma; onChange devuelve el mismo formato.
 */
export function SpecialtyPicker({ value, onChange, max = 3 }: { value: string; onChange: (v: string) => void; max?: number }) {
  const selected = useMemo(() => value.split(',').map((s) => s.trim()).filter(Boolean), [value]);
  const custom = selected.find((s) => !KNOWN.includes(s)) ?? '';
  const [otherMode, setOtherMode] = useState(!!custom);

  const emit = (list: string[]) => onChange(list.join(', '));
  const atMax = () => appAlert(`Máximo ${max}`, `Puedes elegir hasta ${max} especialidades.`);

  const toggleKnown = (spec: string) => {
    if (selected.includes(spec)) emit(selected.filter((s) => s !== spec));
    else if (selected.length < max) emit([...selected, spec]);
    else atMax();
  };

  const setCustom = (text: string) => {
    const withoutCustom = selected.filter((s) => KNOWN.includes(s));
    const t = text.trim();
    if (!t) return emit(withoutCustom);
    if (withoutCustom.length >= max) return atMax();
    emit([...withoutCustom, t]);
  };

  const toggleOther = () => {
    if (otherMode) {
      setOtherMode(false);
      emit(selected.filter((s) => KNOWN.includes(s))); // quita la especialidad libre
    } else {
      setOtherMode(true);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.counter}>Selecciona hasta {max} · {selected.length}/{max}</Text>
      <View style={styles.chips}>
        {VET_SPECIALTIES.map((s) => {
          const on = selected.includes(s);
          return (
            <Pressable key={s} style={[styles.chip, on && styles.chipOn]} onPress={() => toggleKnown(s)}>
              <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{s}</Text>
            </Pressable>
          );
        })}
        <Pressable style={[styles.chip, otherMode && styles.chipOn]} onPress={toggleOther}>
          <Text style={[styles.chipTxt, otherMode && styles.chipTxtOn]}>{OTHER_SPECIALTY}</Text>
        </Pressable>
      </View>

      {otherMode && (
        <TextInput
          style={styles.input}
          value={custom}
          onChangeText={setCustom}
          placeholder="Escribe una especialidad"
          placeholderTextColor={colors.muted}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  counter: { fontSize: 12, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { ...type.bodySmall, color: colors.text },
  chipTxtOn: { color: colors.white, fontWeight: '700' },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
});
