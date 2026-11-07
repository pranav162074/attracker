import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Subject } from '../lib/api.ts';
import { showTime, WEEKDAY_SHORT } from '../lib/grid.ts';
import type { DraftSlot } from '../lib/grid.ts';
import { abbreviate, slotAt, weekRows } from '../lib/weekView.ts';
import { colors, space } from '../ui/theme.ts';

type Props = {
  draft: DraftSlot[];
  days: number[];
  subjects: Map<number, Subject>;
  onOpen: (weekday: number, slot: DraftSlot | null) => void;
};

export const WeekOverview = ({ draft, days, subjects, onOpen }: Props) => {
  const rows = weekRows(draft, days);
  if (rows.length === 0) return null;
  return (
    <View style={styles.wrap} aria-label="Week at a glance">
      <View style={styles.row}>
        <View style={styles.timeCell} />
        {days.map((day) => (
          <Text key={day} style={styles.head}>
            {WEEKDAY_SHORT[day - 1]}
          </Text>
        ))}
      </View>
      {rows.map((start) => (
        <View key={start} style={styles.row}>
          <Text style={[styles.timeCell, styles.time]}>{showTime(start).replace(/\s?(am|pm)$/i, '')}</Text>
          {days.map((day) => {
            const slot = slotAt(draft, day, start);
            const subject = slot ? subjects.get(slot.subjectId) : undefined;
            const label = subject ? abbreviate(subject.name, subject.shortName) : '';
            return (
              <Pressable
                key={day}
                role="button"
                aria-label={slot ? `${WEEKDAY_SHORT[day - 1]} ${showTime(start)}, ${subject?.name ?? 'class'}` : `Add a class on ${WEEKDAY_SHORT[day - 1]}`}
                onPress={() => onOpen(day, slot)}
                style={[styles.cell, slot ? { backgroundColor: `${subject?.colour ?? colors.border}33` } : styles.emptyCell]}
              >
                <Text style={styles.cellText} numberOfLines={2}>
                  {slot ? label : '+'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      <Text style={styles.note}>Tap a class to change it, or + to add one.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  row: { flexDirection: 'row', gap: 3, marginBottom: 3 },
  timeCell: { width: 40 },
  time: { fontSize: 11, color: colors.muted, alignSelf: 'center' },
  head: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: colors.muted },
  cell: { flex: 1, minHeight: 34, borderRadius: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  emptyCell: { borderWidth: 1, borderColor: colors.surface, borderStyle: 'dashed' },
  cellText: { fontSize: 11, color: colors.text, textAlign: 'center' },
  note: { fontSize: 12, color: colors.muted, marginTop: space.xs },
});
