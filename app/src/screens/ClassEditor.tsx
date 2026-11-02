import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Subject } from '../lib/api.ts';
import { checkClass, classFormFor, guessPeriods, parseTime, showTime, WEEKDAY_NAMES } from '../lib/grid.ts';
import type { ClassForm, DraftSlot } from '../lib/grid.ts';
import { Button } from '../ui/Button.tsx';
import { Dot } from '../ui/Controls.tsx';
import { TextField } from '../ui/TextField.tsx';
import { colors, space } from '../ui/theme.ts';

type Props = {
  title?: string;
  doneLabel?: string;
  weekday: number;
  slot: DraftSlot | null;
  suggestion: { start: number; end: number } | null;
  draft: DraftSlot[];
  subjects: Subject[];
  onDone: (slot: DraftSlot) => void;
  onRemove: (key: string) => void;
  onClose: () => void;
};

const readsAs = (text: string) => {
  if (!text.trim() || /[ap]\.?m/i.test(text)) return null;
  const minutes = parseTime(text);
  return minutes === null ? null : `Reads as ${showTime(minutes)}`;
};

export const ClassEditor = ({ title, doneLabel, weekday, slot, suggestion, draft, subjects, onDone, onRemove, onClose }: Props) => {
  const [form, setForm] = useState<ClassForm>(() => classFormFor(slot, suggestion));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [periodsTouched, setPeriodsTouched] = useState(slot !== null);

  const setTime = (key: 'start' | 'end', value: string) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (periodsTouched) return next;
      const start = parseTime(next.start);
      const end = parseTime(next.end);
      return start !== null && end !== null ? { ...next, periods: guessPeriods(start, end, draft) } : next;
    });
  };

  const setPeriods = (periods: number) => {
    setPeriodsTouched(true);
    setForm((current) => ({ ...current, periods: Math.min(12, Math.max(1, periods)) }));
  };

  const done = () => {
    const result = checkClass(form, weekday, draft, slot?.key ?? null);
    setErrors(result.errors);
    if (result.slot) onDone(result.slot);
  };

  const active = subjects.filter((subject) => !subject.archived || subject.id === slot?.subjectId);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable role="button" onPress={onClose} style={styles.headerButton}>
            <Text style={styles.headerAction}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle} role="heading">
            {title ?? `${slot ? 'Edit class' : 'Add class'}, ${WEEKDAY_NAMES[weekday - 1]}`}
          </Text>
          <View style={styles.headerButton} />
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Subject</Text>
          {errors.subject ? <Text style={styles.error}>{errors.subject}</Text> : null}
          <View style={styles.subjects} role="radiogroup" aria-label="Subject">
            {active.map((subject) => {
              const selected = form.subjectId === subject.id;
              return (
                <Pressable
                  key={subject.id}
                  role="radio"
                  aria-checked={selected}
                  aria-label={subject.name}
                  onPress={() => setForm((current) => ({ ...current, subjectId: subject.id }))}
                  style={[styles.subject, selected ? styles.subjectSelected : null]}
                >
                  <Dot colour={subject.colour} />
                  <Text style={[styles.subjectText, selected ? styles.subjectTextSelected : null]} numberOfLines={2}>
                    {subject.name}
                    {subject.countsAttendance ? '' : ' (not counted)'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.times}>
            <View style={styles.time}>
              <TextField label="Starts" value={form.start} onChangeText={(value) => setTime('start', value)} error={errors.start} hint={readsAs(form.start)} placeholder="8:40" autoCorrect={false} maxLength={10} />
            </View>
            <View style={styles.time}>
              <TextField label="Ends" value={form.end} onChangeText={(value) => setTime('end', value)} error={errors.end} hint={readsAs(form.end)} placeholder="9:30" autoCorrect={false} maxLength={10} />
            </View>
          </View>

          <Text style={styles.label}>Periods</Text>
          <View style={styles.stepper}>
            <Pressable role="button" aria-label="One period fewer" onPress={() => setPeriods(form.periods - 1)} style={styles.step} disabled={form.periods <= 1}>
              <Text style={[styles.stepText, form.periods <= 1 ? styles.stepDisabled : null]}>−</Text>
            </Pressable>
            <Text style={styles.stepValue} aria-label={`${form.periods} periods`}>
              {form.periods}
            </Text>
            <Pressable role="button" aria-label="One period more" onPress={() => setPeriods(form.periods + 1)} style={styles.step} disabled={form.periods >= 12}>
              <Text style={[styles.stepText, form.periods >= 12 ? styles.stepDisabled : null]}>+</Text>
            </Pressable>
          </View>
          <Text style={styles.note}>A lab that takes three periods in a row is 3. It counts as 3 classes unless the subject is set to count each class as one.</Text>

          <View style={styles.actions}>
            <Button title={doneLabel ?? (slot ? 'Done' : 'Add')} onPress={done} />
            {slot ? <Button title="Remove this class" variant="secondary" onPress={() => onRemove(slot.key)} /> : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.surface },
  headerButton: { minWidth: 64, paddingVertical: space.sm },
  headerAction: { fontSize: 16, color: colors.primary },
  headerTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  body: { padding: space.xl, paddingBottom: space.xxl * 2, width: '100%', maxWidth: 640, alignSelf: 'center' },
  label: { fontSize: 14, color: colors.text, marginBottom: space.xs, fontWeight: '500' },
  error: { color: colors.error, fontSize: 13, marginBottom: space.xs },
  subjects: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  subject: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: space.md, paddingVertical: space.sm, maxWidth: '100%' },
  subjectSelected: { borderColor: colors.primary, backgroundColor: '#e8f0fb' },
  subjectText: { fontSize: 14, color: colors.text, flexShrink: 1 },
  subjectTextSelected: { color: colors.primary, fontWeight: '600' },
  times: { flexDirection: 'row', gap: space.md },
  time: { flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderRadius: 6 },
  step: { width: 48, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 22, color: colors.primary },
  stepDisabled: { color: colors.disabled },
  stepValue: { minWidth: 36, textAlign: 'center', fontSize: 17, color: colors.text, fontWeight: '600' },
  note: { fontSize: 13, color: colors.muted, marginTop: space.sm, lineHeight: 18 },
  actions: { gap: space.md, marginTop: space.xl },
});
