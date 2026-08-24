import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, type } from '../theme';
import { VET_SPECIALTIES, OTHER_SPECIALTY, isKnownSpecialty } from '../lib/specialties';

/**
 * Selector de especialidad: chips de la taxonomía estándar + "Otra" (texto libre).
 * `value` es la especialidad guardada (string). Vacío = ninguna seleccionada.
 */
export function SpecialtyPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [otherMode, setOtherMode] = useState(!!value && !isKnownSpecialty(value));

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.chips}>
        {VET_SPECIALTIES.map((s) => {
          const on = !otherMode && value === s;
          return (
            <Pressable
              key={s}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => { setOtherMode(false); onChange(s); }}
            >
              <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{s}</Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[styles.chip, otherMode && styles.chipOn]}
          onPress={() => { setOtherMode(true); onChange(''); }}
        >
          <Text style={[styles.chipTxt, otherMode && styles.chipTxtOn]}>{OTHER_SPECIALTY}</Text>
        </Pressable>
      </View>

      {otherMode && (
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder="Escribe tu especialidad"
          placeholderTextColor={colors.muted}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
