import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../../../session.tsx';
import { ApiError } from '../../../../lib/api.ts';
import type { Grid, Subject, Timetable } from '../../../../lib/api.ts';
import { formatDate } from '../../../../lib/dates.ts';
import { localDate } from '../../../../lib/format.ts';
import { problemFrom } from '../../../../lib/forms.ts';
import { archivedInUse, copyDay, dayCounts, fromServer, replaceSlot, sameGrid, showTime, slotsOn, suggestNext, toServer, WEEKDAY_NAMES, WEEKDAY_SHORT } from '../../../../lib/grid.ts';
import type { DraftSlot } from '../../../../lib/grid.ts';
import { ClassEditor } from '../../../../screens/ClassEditor.tsx';
import { useLoad } from '../../../../useLoad.ts';
import { Button } from '../../../../ui/Button.tsx';
import { Dot, ListBox, ListRow } from '../../../../ui/Controls.tsx';
import { DateField } from '../../../../ui/DateField.tsx';
import { ErrorNotice } from '../../../../ui/Notice.tsx';
import { LoadFailed, Loading, Muted, Page } from '../../../../ui/Page.tsx';
import { colors, space } from '../../../../ui/theme.ts';

type Loaded = { timetable: Timetable; subjects: Subject[]; grid: Grid };

const clampDate = (date: string, timetable: Timetable) => {
  if (date < timetable.startsOn) return timetable.startsOn;
  if (timetable.endsOn && date > timetable.endsOn) return timetable.endsOn;
  return date;
};

const loadAll = async (id: number): Promise<Loaded> => {
  const timetable = await api.timetable(id);
  const [subjects, grid] = await Promise.all([api.subjects(id, true), api.grid(id, timetable.status === 'setup' ? timetable.startsOn : undefined)]);
  return { timetable, subjects, grid };
};

const Editor = ({ timetable, subjects, grid }: Loaded) => {
  const router = useRouter();
  const [saved] = useState(() => fromServer(grid.slots));
  const [draft, setDraft] = useState<DraftSlot[]>(saved);
  const counts = dayCounts(draft);
  const [weekday, setWeekday] = useState(1);
  const [showWeekend, setShowWeekend] = useState(counts[5]! > 0 || counts[6]! > 0);
  const [editing, setEditing] = useState<{ slot: DraftSlot | null } | null>(null);
  const [copying, setCopying] = useState(false);
  const [from, setFrom] = useState<string | null>(timetable.status === 'setup' ? timetable.startsOn : clampDate(localDate(), timetable));
  const [message, setMessage] = useState<string | null>(null);
  const [lostMarks, setLostMarks] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byId = new Map(subjects.map((subject) => [subject.id, subject]));
  const archived = archivedInUse(draft, new Set(subjects.filter((subject) => subject.archived).map((subject) => subject.id)));
  const days = showWeekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];
  const today = slotsOn(draft, weekday);
  const changed = !sameGrid(saved, draft);
  const tracking = timetable.status === 'tracking';

  const save = async (discardMarks = false) => {
    if (!from) {
      setMessage('Choose the date these changes start from.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.saveGrid(timetable.id, { effectiveFrom: from, slots: toServer(draft), discardMarks });
      router.back();
    } catch (error) {
      setBusy(false);
      if (error instanceof ApiError && error.code === 'marks_would_be_lost') {
        setLostMarks(error.message);
        return;
      }
      setMessage(problemFrom(error).message);
    }
  };

  if (subjects.filter((subject) => !subject.archived).length === 0) {
    return (
      <Page>
        <Muted>Add your subjects first. Then come back here to put them into the week.</Muted>
        <Button title="Add subjects" onPress={() => router.replace(`/timetables/${timetable.id}/subjects`)} />
      </Page>
    );
  }

  return (
    <Page>
      <Muted>
        {tracking
          ? 'Changes apply from the date you choose. Earlier weeks keep the old timetable, so your past attendance stays as it was.'
          : 'Enter one normal week. Holidays and days that follow another day’s timetable are added separately.'}
      </Muted>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {days.map((day) => {
          const selected = day === weekday;
          return (
            <Pressable
              key={day}
              role="tab"
              aria-selected={selected}
              aria-label={`${WEEKDAY_NAMES[day - 1]}, ${counts[day - 1]} classes`}
              onPress={() => setWeekday(day)}
              style={[styles.tab, selected ? styles.tabSelected : null]}
            >
              <Text style={[styles.tabText, selected ? styles.tabTextSelected : null]}>{WEEKDAY_SHORT[day - 1]}</Text>
              <Text style={[styles.tabCount, selected ? styles.tabTextSelected : null]}>{counts[day - 1]}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {!showWeekend ? (
        <Pressable role="button" onPress={() => setShowWeekend(true)} style={styles.weekendLink}>
          <Text style={styles.link}>Show Saturday and Sunday</Text>
        </Pressable>
      ) : null}

      <Text style={styles.dayTitle} role="heading">
        {WEEKDAY_NAMES[weekday - 1]}
      </Text>
      {today.length === 0 ? (
        <Muted>No classes on {WEEKDAY_NAMES[weekday - 1]}.</Muted>
      ) : (
        <ListBox>
          {today.map((slot) => {
            const subject = byId.get(slot.subjectId);
            const detail = [`${showTime(slot.start)} to ${showTime(slot.end)}`, slot.periods > 1 ? `${slot.periods} periods` : null, subject?.archived ? 'archived subject' : null]
              .filter(Boolean)
              .join(' · ');
            return <ListRow key={slot.key} title={subject?.name ?? 'Unknown subject'} detail={detail} left={<Dot colour={subject?.colour ?? null} />} onPress={() => setEditing({ slot })} />;
          })}
        </ListBox>
      )}
      <View style={styles.dayActions}>
        <Button title="Add class" variant="secondary" onPress={() => setEditing({ slot: null })} />
        {today.length > 0 ? <Button title={`Copy ${WEEKDAY_NAMES[weekday - 1]} to another day`} variant="secondary" onPress={() => setCopying(true)} /> : null}
      </View>

      <View style={styles.saveArea}>
        {tracking ? <DateField label="Changes apply from" value={from} onChange={setFrom} /> : null}
        {archived.length > 0 ? (
          <ErrorNotice message={`${archived.map((id) => byId.get(id)?.name).join(', ')} ${archived.length === 1 ? 'is' : 'are'} archived. Change or remove those classes, or bring the subject back, before saving.`} />
        ) : null}
        <ErrorNotice message={message} />
        {lostMarks ? (
          <View style={styles.lost}>
            <Text style={styles.lostText}>{lostMarks}</Text>
            <View style={styles.lostActions}>
              <Button title="Keep editing" variant="secondary" onPress={() => setLostMarks(null)} />
              <Button title="Discard those marks and save" variant="danger" onPress={() => save(true)} busy={busy} />
            </View>
          </View>
        ) : (
          <Button title={tracking ? `Save from ${from ? formatDate(from) : '…'}` : 'Save timetable'} onPress={() => save(false)} busy={busy} disabled={archived.length > 0 || (!changed && grid.version !== null)} />
        )}
        <Text style={styles.total}>
          {draft.length} {draft.length === 1 ? 'class' : 'classes'} a week{changed ? ', not saved yet' : ''}
        </Text>
      </View>

      {editing ? (
        <ClassEditor
          weekday={weekday}
          slot={editing.slot}
          suggestion={suggestNext(draft, weekday)}
          draft={draft}
          subjects={subjects}
          onClose={() => setEditing(null)}
          onDone={(slot) => {
            setDraft((current) => replaceSlot(current, slot));
            setEditing(null);
          }}
          onRemove={(key) => {
            setDraft((current) => current.filter((item) => item.key !== key));
            setEditing(null);
          }}
        />
      ) : null}

      <Modal visible={copying} transparent animationType="fade" onRequestClose={() => setCopying(false)}>
        <Pressable style={styles.backdrop} onPress={() => setCopying(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Copy {WEEKDAY_NAMES[weekday - 1]}’s classes to</Text>
            <Text style={styles.sheetNote}>This replaces the classes already on that day.</Text>
            {[1, 2, 3, 4, 5, 6, 7]
              .filter((day) => day !== weekday)
              .map((day) => (
                <Pressable
                  key={day}
                  role="button"
                  aria-label={`Copy to ${WEEKDAY_NAMES[day - 1]}`}
                  onPress={() => {
                    setDraft((current) => copyDay(current, weekday, day));
                    if (day >= 6) setShowWeekend(true);
                    setWeekday(day);
                    setCopying(false);
                  }}
                  style={styles.sheetRow}
                >
                  <Text style={styles.sheetRowText}>{WEEKDAY_NAMES[day - 1]}</Text>
                  <Text style={styles.sheetRowCount}>{counts[day - 1] ? `${counts[day - 1]} now` : 'empty'}</Text>
                </Pressable>
              ))}
          </Pressable>
        </Pressable>
      </Modal>
    </Page>
  );
};

export default function GridScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const timetableId = Number(id);
  const load = useCallback(() => loadAll(timetableId), [timetableId]);
  const { data, error, loading, refreshing, refresh } = useLoad(load);
  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;
  return <Editor {...data} />;
}

const styles = StyleSheet.create({
  tabs: { gap: space.sm, paddingBottom: space.xs },
  tab: { minWidth: 56, alignItems: 'center', paddingVertical: space.sm, paddingHorizontal: space.sm, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
  tabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 14, color: colors.text, fontWeight: '600' },
  tabCount: { fontSize: 12, color: colors.muted, marginTop: 2 },
  tabTextSelected: { color: '#ffffff' },
  weekendLink: { paddingVertical: space.sm, alignSelf: 'flex-start' },
  link: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  dayTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginTop: space.lg, marginBottom: space.md },
  dayActions: { gap: space.md, marginTop: space.md },
  saveArea: { marginTop: space.xxl, borderTopWidth: 1, borderTopColor: colors.surface, paddingTop: space.xl },
  lost: { borderWidth: 1, borderColor: colors.error, borderRadius: 8, padding: space.lg, backgroundColor: colors.errorBackground, gap: space.md },
  lostText: { fontSize: 15, color: colors.text, lineHeight: 21 },
  lostActions: { gap: space.md },
  total: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: space.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: space.lg },
  sheet: { backgroundColor: colors.background, borderRadius: 10, padding: space.lg, width: '100%', maxWidth: 380, alignSelf: 'center' },
  sheetTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  sheetNote: { fontSize: 13, color: colors.muted, marginTop: space.xs, marginBottom: space.sm },
  sheetRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sheetRowText: { fontSize: 15, color: colors.text },
  sheetRowCount: { fontSize: 14, color: colors.muted },
});
