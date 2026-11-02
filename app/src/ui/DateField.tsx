import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDate, MONTHS, monthGrid, parseIso, shiftMonth, WEEKDAY_LETTERS } from '../lib/dates.ts';
import { localDate } from '../lib/format.ts';
import { colors, space } from './theme.ts';

type Props = {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string | undefined;
  optional?: boolean;
  hint?: string;
  near?: string | null;
};

const Calendar = ({ value, near, onPick }: { value: string | null; near: string | null; onPick: (iso: string) => void }) => {
  const today = localDate();
  const [view, setView] = useState(() => {
    const { year, month } = parseIso(value ?? near ?? today);
    return { year, month };
  });
  const weeks = monthGrid(view.year, view.month);
  return (
    <View>
      <View style={styles.monthBar}>
        <Pressable role="button" aria-label="Previous month" onPress={() => setView(shiftMonth(view.year, view.month, -1))} style={styles.arrow}>
          <Text style={styles.arrowText}>‹</Text>
        </Pressable>
        <Text style={styles.monthTitle}>
          {MONTHS[view.month]} {view.year}
        </Text>
        <Pressable role="button" aria-label="Next month" onPress={() => setView(shiftMonth(view.year, view.month, 1))} style={styles.arrow}>
          <Text style={styles.arrowText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.week}>
        {WEEKDAY_LETTERS.map((letter, index) => (
          <Text key={index} style={styles.weekday}>
            {letter}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]!.iso} style={styles.week}>
          {week.map((cell) => {
            const selected = cell.iso === value;
            return (
              <Pressable
                key={cell.iso}
                role="button"
                aria-label={formatDate(cell.iso)}
                aria-selected={selected}
                onPress={() => onPick(cell.iso)}
                style={[styles.day, selected ? styles.daySelected : null]}
              >
                <Text
                  style={[
                    styles.dayText,
                    !cell.inMonth ? styles.dayOutside : null,
                    cell.iso === today && !selected ? styles.dayToday : null,
                    selected ? styles.dayTextSelected : null,
                  ]}
                >
                  {cell.day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
};

export const DateField = ({ label, value, onChange, error, optional = false, hint, near = null }: Props) => {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable role="button" aria-label={`${label}: ${value ? formatDate(value) : 'not set'}`} onPress={() => setOpen(true)} style={[styles.field, error ? styles.fieldError : null]}>
        <Text style={value ? styles.value : styles.placeholder}>{value ? formatDate(value) : optional ? 'Not set' : 'Choose a date'}</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <Calendar
              value={value}
              near={near}
              onPick={(iso) => {
                onChange(iso);
                setOpen(false);
              }}
            />
            <View style={styles.sheetActions}>
              {optional && value ? (
                <Pressable
                  role="button"
                  onPress={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  style={styles.sheetButton}
                >
                  <Text style={styles.sheetButtonText}>Clear</Text>
                </Pressable>
              ) : null}
              <Pressable role="button" onPress={() => setOpen(false)} style={styles.sheetButton}>
                <Text style={styles.sheetButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  label: { fontSize: 14, color: colors.text, marginBottom: space.xs, fontWeight: '500' },
  field: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: space.md, paddingVertical: 11 },
  fieldError: { borderColor: colors.error },
  value: { fontSize: 16, color: colors.text },
  placeholder: { fontSize: 16, color: colors.muted },
  error: { color: colors.error, fontSize: 13, marginTop: space.xs },
  hint: { color: colors.muted, fontSize: 13, marginTop: space.xs },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: space.lg },
  sheet: { backgroundColor: colors.background, borderRadius: 10, padding: space.lg, width: '100%', maxWidth: 380, alignSelf: 'center' },
  sheetTitle: { fontSize: 15, color: colors.muted, marginBottom: space.sm },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  monthTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  arrow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 26, color: colors.primary },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, color: colors.muted, paddingVertical: space.xs },
  day: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  daySelected: { backgroundColor: colors.primary },
  dayText: { fontSize: 15, color: colors.text },
  dayOutside: { color: colors.disabled },
  dayToday: { color: colors.primary, fontWeight: '700' },
  dayTextSelected: { color: '#ffffff', fontWeight: '600' },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.sm },
  sheetButton: { paddingHorizontal: space.md, paddingVertical: space.sm },
  sheetButtonText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
});
