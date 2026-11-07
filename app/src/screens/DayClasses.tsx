import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../session.tsx';
import { NetworkError } from '../lib/api.ts';
import type { Day, DayClass, Mark, Subject } from '../lib/api.ts';
import { applyMark, applyPending, canMark, choiceOf, dayNotes, dayTotals, hasStarted, markFor, statusLine } from '../lib/day.ts';
import type { Choice } from '../lib/day.ts';
import { problemFrom } from '../lib/forms.ts';
import { clockToMinutes, minutesToClock, showTime } from '../lib/grid.ts';
import type { DraftSlot } from '../lib/grid.ts';
import { pendingFor, queueMark, readOutbox } from '../lib/offline.ts';
import { storage } from '../storage.ts';
import { useLoad } from '../useLoad.ts';
import { ClassEditor } from './ClassEditor.tsx';
import { Dot } from '../ui/Controls.tsx';
import { ErrorNotice } from '../ui/Notice.tsx';
import { LoadFailed, Loading, Muted } from '../ui/Page.tsx';
import { OfflineNotice } from '../ui/OfflineNotice.tsx';
import { colors, space, tones } from '../ui/theme.ts';

const CHOICES: { value: Choice; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'cancelled', label: 'Cancelled' },
];

const choiceColours: Record<Choice, { background: string; text: string }> = {
  present: { background: tones.good.text, text: '#ffffff' },
  absent: { background: tones.bad.text, text: '#ffffff' },
  cancelled: { background: colors.muted, text: '#ffffff' },
};

const loadDay = async (id: number, date: string) => {
  const [subjects, day] = await Promise.all([api.subjects(id, true), api.day(id, date)]);
  return { subjects, day };
};

const withPending = async (id: number, date: string, loaded: Awaited<ReturnType<typeof loadDay>>) => {
  const pending = pendingFor(await readOutbox(storage), id, date);
  return { ...loaded, day: applyPending(loaded.day, pending, new Date()), queued: pending.length };
};

type Editing = { kind: 'extra'; item: DayClass | null } | { kind: 'substitute'; item: DayClass } | { kind: 'more'; item: DayClass };

const Choices = ({
  options,
  current,
  busy,
  label,
  onChoose,
}: {
  options: typeof CHOICES;
  current: Choice;
  busy: boolean;
  label: string;
  onChoose: (choice: Choice) => void;
}) => (
  <View style={styles.choices} role="radiogroup" aria-label={label}>
    {options.map((option) => {
      const selected = option.value === current;
      const colour = choiceColours[option.value];
      return (
        <Pressable
          key={option.value}
          role="radio"
          aria-checked={selected}
          aria-label={option.label}
          disabled={busy}
          onPress={() => {
            if (!selected) onChoose(option.value);
          }}
          style={[styles.choice, selected ? { backgroundColor: colour.background, borderColor: colour.background } : null]}
        >
          <Text style={[styles.choiceText, selected ? { color: colour.text } : null]}>{option.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

const ClassRow = ({
  item,
  day,
  byId,
  busy,
  onChoose,
  onMore,
}: {
  item: DayClass;
  day: Day;
  byId: Map<number, Subject>;
  busy: boolean;
  onChoose: (choice: Choice) => void;
  onMore: () => void;
}) => {
  const subject = byId.get(item.subjectId);
  const scheduled = byId.get(item.scheduledSubjectId);
  const swapped = item.subjectId !== item.scheduledSubjectId;
  const extra = item.extraId !== null;
  const current = choiceOf(item);
  const markable = canMark(day, item);
  const options = extra ? CHOICES.filter((choice) => choice.value !== 'cancelled') : CHOICES;
  const detail = [`${showTime(clockToMinutes(item.start))} to ${showTime(clockToMinutes(item.end))}`, item.units > 1 ? `${item.units} periods` : null, extra ? 'extra class' : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={[styles.row, busy ? styles.rowBusy : null]}>
      <View style={styles.rowTop}>
        <View style={styles.dot}>
          <Dot colour={subject?.colour ?? null} />
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, item.status === 'cancelled' ? styles.struck : null]}>
            {subject?.name ?? 'Class'}
            {swapped ? ` (instead of ${scheduled?.name ?? 'another subject'})` : ''}
          </Text>
          <Text style={styles.rowDetail}>{detail}</Text>
          <Text style={styles.rowStatus}>{statusLine(item)}</Text>
        </View>
      </View>
      {markable && !(item.counts || swapped) ? (
        <Pressable role="button" aria-label={`More for ${subject?.name ?? 'class'}`} onPress={onMore} disabled={busy} style={styles.moreAlone}>
          <Text style={styles.moreText}>More</Text>
        </Pressable>
      ) : null}
      {markable && (item.counts || swapped) ? (
        <View style={styles.actions}>
          <Choices options={options} current={current} busy={busy} label={`Attendance for ${subject?.name ?? 'class'} at ${showTime(clockToMinutes(item.start))}`} onChoose={onChoose} />
          <Pressable role="button" aria-label={`More for ${subject?.name ?? 'class'}`} onPress={onMore} disabled={busy} style={styles.more}>
            <Text style={styles.moreText}>More</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
};

const MoreSheet = ({ item, name, onSubstitute, onEditExtra, onAddExtra, onClose }: { item: DayClass; name: string; onSubstitute: () => void; onEditExtra: () => void; onAddExtra: () => void; onClose: () => void }) => (
  <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable style={styles.sheet} onPress={() => {}}>
        <Text style={styles.sheetTitle}>{name}</Text>
        <Text style={styles.sheetNote}>
          {showTime(clockToMinutes(item.start))} to {showTime(clockToMinutes(item.end))}
        </Text>
        {item.extraId !== null ? (
          <Pressable role="button" onPress={onEditExtra} style={styles.sheetRow}>
            <Text style={styles.sheetRowText}>Edit or remove this extra class</Text>
          </Pressable>
        ) : (
          <Pressable role="button" onPress={onSubstitute} style={styles.sheetRow}>
            <Text style={styles.sheetRowText}>Another subject was taught instead</Text>
          </Pressable>
        )}
        <Pressable role="button" onPress={onAddExtra} style={styles.sheetRow}>
          <Text style={styles.sheetRowText}>Add an extra class on this day</Text>
        </Pressable>
        <Pressable role="button" onPress={onClose} style={styles.sheetCancel}>
          <Text style={styles.sheetCancelText}>Close</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  </Modal>
);

const SubstitutePicker = ({ item, subjects, onPick, onClose }: { item: DayClass; subjects: Subject[]; onPick: (subjectId: number) => void; onClose: () => void }) => (
  <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable style={styles.sheet} onPress={() => {}}>
        <Text style={styles.sheetTitle}>Who took this class?</Text>
        <Text style={styles.sheetNote}>Pick the subject that was actually taught. Attendance counts for that subject instead.</Text>
        <ScrollView style={styles.sheetList}>
          {subjects
            .filter((subject) => !subject.archived)
            .map((subject) => (
              <Pressable key={subject.id} role="button" aria-label={subject.name} onPress={() => onPick(subject.id)} style={styles.sheetRow}>
                <Dot colour={subject.colour} />
                <Text style={[styles.sheetRowText, subject.id === item.subjectId ? styles.sheetRowCurrent : null]}>
                  {subject.name}
                  {subject.id === item.scheduledSubjectId ? ' (as scheduled)' : ''}
                </Text>
              </Pressable>
            ))}
        </ScrollView>
        <Pressable role="button" onPress={onClose} style={styles.sheetCancel}>
          <Text style={styles.sheetCancelText}>Cancel</Text>
        </Pressable>
      </Pressable>
    </Pressable>
  </Modal>
);

type Props = {
  timetableId: number;
  date: string;
  empty?: (day: Day) => ReactNode;
  onChanged?: () => void;
  showAddExtra?: boolean;
};

export const DayClasses = ({ timetableId, date, empty, onChanged, showAddExtra = true }: Props) => {
  const load = useCallback(() => loadDay(timetableId, date), [timetableId, date]);
  const finish = useCallback((loaded: Awaited<ReturnType<typeof loadDay>>) => withPending(timetableId, date, loaded), [timetableId, date]);
  const { data, error, loading, refreshing, refresh, savedAt } = useLoad(load, `day.${timetableId}.${date}`, finish);
  const [override, setOverride] = useState<{ base: typeof data; day: Day } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [queuedCount, setQueuedCount] = useState<{ base: unknown; count: number } | null>(null);

  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;

  const day = override && override.base === data ? override.day : data.day;
  if (day.date !== date) return <Loading />;
  const byId = new Map(data.subjects.map((subject) => [subject.id, subject]));

  const run = async (key: string, action: () => Promise<Day>) => {
    setBusyKey(key);
    setMessage(null);
    try {
      setOverride({ base: data, day: await action() });
      onChanged?.();
    } catch (failure) {
      setMessage(problemFrom(failure).message);
    }
    setBusyKey(null);
  };

  const markSlot = async (item: DayClass, mark: Mark) => {
    try {
      return await api.mark(timetableId, date, item.slotId!, mark);
    } catch (failure) {
      if (!(failure instanceof NetworkError)) throw failure;
      const queued = await queueMark(storage, { timetableId, date, slotId: item.slotId!, mark });
      setQueuedCount({ base: data, count: queued });
      return { ...day, classes: day.classes.map((other) => (other.key === item.key ? applyMark(other, mark, hasStarted(date, other.start, new Date())) : other)) };
    }
  };

  const choose = (item: DayClass, choice: Choice) => {
    if (item.extraId !== null) {
      run(item.key, () => api.updateExtra(timetableId, item.extraId!, { attendance: choice === 'absent' ? 'absent' : 'present' }));
      return;
    }
    run(item.key, () => markSlot(item, markFor(choice, item)));
  };

  const totals = dayTotals(day);
  const notes = dayNotes(day);
  const extraDraft = (item: DayClass | null): DraftSlot | null =>
    item ? { key: item.key, weekday: 1, start: clockToMinutes(item.start), end: clockToMinutes(item.end), periods: item.units, subjectId: item.subjectId } : null;
  const canAddExtra = day.tracking && day.kind !== 'outside';

  return (
    <View>
      {notes.map((note) => (
        <Muted key={note}>{note}</Muted>
      ))}
      <OfflineNotice savedAt={savedAt} queued={queuedCount && queuedCount.base === data ? queuedCount.count : data.queued} />
      <ErrorNotice message={message} />
      {day.classes.length === 0 ? (
        (empty?.(day) ?? <Muted>{day.kind === 'holiday' || day.kind === 'outside' ? 'No classes.' : 'No classes on this day.'}</Muted>)
      ) : (
        <View style={styles.list}>
          {day.classes.map((item) => (
            <ClassRow
              key={item.key}
              item={item}
              day={day}
              byId={byId}
              busy={busyKey === item.key}
              onChoose={(choice) => choose(item, choice)}
              onMore={() => setEditing({ kind: 'more', item })}
            />
          ))}
        </View>
      )}
      {totals.held > 0 ? (
        <Text style={styles.totals}>
          {totals.attended} of {totals.held} attended so far on this day
        </Text>
      ) : null}
      {showAddExtra && canAddExtra ? (
        <Pressable role="button" onPress={() => setEditing({ kind: 'extra', item: null })} style={styles.addExtra}>
          <Text style={styles.moreText}>+ Add an extra class</Text>
        </Pressable>
      ) : null}

      {editing?.kind === 'more' ? (
        <MoreSheet
          item={editing.item}
          name={byId.get(editing.item.subjectId)?.name ?? 'Class'}
          onClose={() => setEditing(null)}
          onSubstitute={() => setEditing({ kind: 'substitute', item: editing.item })}
          onEditExtra={() => setEditing({ kind: 'extra', item: editing.item })}
          onAddExtra={() => setEditing({ kind: 'extra', item: null })}
        />
      ) : null}

      {editing?.kind === 'substitute' ? (
        <SubstitutePicker
          item={editing.item}
          subjects={data.subjects}
          onClose={() => setEditing(null)}
          onPick={(subjectId) => {
            const item = editing.item;
            setEditing(null);
            const choice = choiceOf(item) === 'absent' ? 'absent' : 'present';
            run(item.key, () => markSlot(item, { attendance: choice, substituteSubjectId: subjectId === item.scheduledSubjectId ? null : subjectId }));
          }}
        />
      ) : null}

      {editing?.kind === 'extra' ? (
        <ClassEditor
          title={editing.item ? 'Edit extra class' : 'Add an extra class'}
          doneLabel={editing.item ? 'Save' : 'Add'}
          weekday={1}
          slot={extraDraft(editing.item)}
          suggestion={null}
          draft={[]}
          subjects={data.subjects}
          onClose={() => setEditing(null)}
          onDone={(slot) => {
            const item = editing.item;
            setEditing(null);
            const input = { subjectId: slot.subjectId, start: minutesToClock(slot.start), end: minutesToClock(slot.end), periods: slot.periods };
            if (item) run(item.key, () => api.updateExtra(timetableId, item.extraId!, input));
            else run('new-extra', () => api.addExtra(timetableId, date, { ...input, attendance: 'present' }));
          }}
          onRemove={() => {
            const item = editing.item!;
            setEditing(null);
            run(item.key, () => api.deleteExtra(timetableId, item.extraId!));
          }}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden', marginTop: space.sm },
  row: { padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, backgroundColor: colors.background },
  rowBusy: { opacity: 0.5 },
  rowTop: { flexDirection: 'row', gap: space.md },
  dot: { paddingTop: 4 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '500', color: colors.text },
  struck: { textDecorationLine: 'line-through', color: colors.muted },
  rowDetail: { fontSize: 13, color: colors.muted, marginTop: 2 },
  rowStatus: { fontSize: 13, color: colors.text, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'stretch', marginTop: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: 6, overflow: 'hidden' },
  choices: { flexDirection: 'row', flex: 1 },
  choice: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRightWidth: 1, borderRightColor: colors.border },
  choiceText: { fontSize: 14, color: colors.text, fontWeight: '500' },
  more: { paddingHorizontal: space.md, justifyContent: 'center' },
  moreAlone: { alignSelf: 'flex-start', paddingVertical: space.sm, marginTop: space.xs },
  moreText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  totals: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: space.md },
  addExtra: { alignSelf: 'flex-start', paddingVertical: space.md },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: space.lg },
  sheet: { backgroundColor: colors.background, borderRadius: 10, padding: space.lg, width: '100%', maxWidth: 420, maxHeight: '80%', alignSelf: 'center' },
  sheetTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  sheetNote: { fontSize: 13, color: colors.muted, marginTop: space.xs, marginBottom: space.sm, lineHeight: 18 },
  sheetList: { flexGrow: 0 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sheetRowText: { fontSize: 15, color: colors.text, flex: 1 },
  sheetRowCurrent: { fontWeight: '700' },
  sheetCancel: { alignSelf: 'flex-end', paddingVertical: space.sm, paddingHorizontal: space.md, marginTop: space.sm },
  sheetCancelText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
});
