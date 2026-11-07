import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../../../session.tsx';
import { prefs } from '../../../prefs';
import { loadSemesters } from '../../../currentSemester.ts';
import { syncRemindersSoon } from '../../../reminderSync.ts';
import { canCount, catchUpKey, classDays, findCatchUp } from '../../../lib/catchUp.ts';
import { parseIso } from '../../../lib/dates.ts';
import { dayTitle, shiftDay } from '../../../lib/day.ts';
import { localDate } from '../../../lib/format.ts';
import { monthParam } from '../../../lib/month.ts';
import { nextClassDay, noClassesText, resumeStep, setupPath, uncheckedDay, uncheckedText } from '../../../lib/semester.ts';
import { useLoad } from '../../../useLoad.ts';
import { CatchUpNotice } from '../../../screens/CatchUpNotice.tsx';
import { DayClasses } from '../../../screens/DayClasses.tsx';
import { FinishSetup, NoSemester } from '../../../screens/NoSemester.tsx';
import { OverallCard } from '../../../screens/OverallCard.tsx';
import { SemesterHeader } from '../../../screens/SemesterHeader.tsx';
import { OfflineNotice } from '../../../ui/OfflineNotice.tsx';
import { LoadFailed, Loading, TabPage } from '../../../ui/Page.tsx';
import { colors, space, tones } from '../../../ui/theme.ts';

const loadToday = async (today: string) => {
  const { list, currentId } = await loadSemesters();
  const current = list.find((item) => item.timetableId === currentId) ?? null;
  if (!current) return { list, currentId, current, tracking: null, setup: null };
  if (current.status === 'setup') return { list, currentId, current, tracking: null, setup: await api.setup(current.timetableId) };
  const id = current.timetableId;
  const [timetable, summary, range, checked, tip, dismissed] = await Promise.all([
    api.timetable(id),
    api.summary(id),
    api.days(id, shiftDay(today, -7), shiftDay(today, 21)),
    prefs.read(`checked.${id}`),
    prefs.read('tip.marking'),
    prefs.read(`catchUp.${id}`),
  ]);
  const catchUp = findCatchUp(timetable, summary.checkpoint?.asOf ?? null);
  const withClasses = catchUp && canCount(catchUp) ? classDays((await api.days(id, catchUp.from, catchUp.to)).days) : null;
  const shownCatchUp = catchUp && withClasses !== 0 && dismissed !== catchUpKey(catchUp) ? catchUp : null;
  return {
    list,
    currentId,
    current,
    setup: null,
    tracking: {
      id,
      summary,
      catchUp: shownCatchUp,
      withClasses,
      unchecked: uncheckedDay(range.days.filter((day) => day.date < today), timetable.trackingStartedOn, checked),
      next: nextClassDay(range.days.filter((day) => day.date > today)),
      tip: tip !== 'done',
    },
  };
};

export default function Today() {
  const router = useRouter();
  const today = localDate();
  const load = useCallback(() => loadToday(today), [today]);
  const { data, error, loading, refreshing, refresh, savedAt } = useLoad(load, 'today');
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    if (data && !savedAt) syncRemindersSoon();
  }, [data, savedAt]);

  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;

  const { list, currentId, current, tracking, setup } = data;
  const hide = (key: string, pref: string, value: string) => {
    setHidden((keys) => [...keys, key]);
    prefs.save(pref, value);
  };

  return (
    <TabPage refreshing={refreshing} onRefresh={refresh}>
      <SemesterHeader title="Today" detail={dayTitle(today, today).replace(/^Today, /, '')} list={list} currentId={currentId} onChanged={refresh} />
      <OfflineNotice savedAt={savedAt} />
      {!current ? <NoSemester /> : null}
      {current && setup ? <FinishSetup semester={current} onContinue={() => router.push(setupPath(current.timetableId, resumeStep(setup.steps)))} /> : null}
      {tracking ? (
        <>
          <OverallCard summary={tracking.summary} />
          {tracking.tip && !hidden.includes('tip') ? (
            <View style={[styles.notice, styles.info]}>
              <Text style={styles.noticeTitle}>How marking works</Text>
              <Text style={styles.noticeBody}>Every class counts as Present. Tap Absent when you miss one, or Cancelled when it does not happen. Use More if another subject was taught instead.</Text>
              <Pressable role="button" onPress={() => hide('tip', 'tip.marking', 'done')} style={styles.noticeAction}>
                <Text style={styles.link}>Got it</Text>
              </Pressable>
            </View>
          ) : null}
          {tracking.catchUp && !hidden.includes('catchUp') ? (
            <CatchUpNotice
              catchUp={tracking.catchUp}
              withClasses={tracking.withClasses}
              onMark={() => router.push(`/timetables/${tracking.id}/month?m=${monthParam(parseIso(tracking.catchUp!.from))}`)}
              onOfficial={() => router.push(`/timetables/${tracking.id}/official`)}
              onDone={() => hide('catchUp', `catchUp.${tracking.id}`, catchUpKey(tracking.catchUp!))}
            />
          ) : null}
          {tracking.unchecked && !hidden.includes('unchecked') ? (
            <View style={[styles.notice, styles.warn]}>
              <Text style={styles.noticeBody}>{uncheckedText(tracking.unchecked, today)}</Text>
              <View style={styles.noticeButtons}>
                <Pressable
                  role="button"
                  onPress={() => {
                    hide('unchecked', `checked.${tracking.id}`, tracking.unchecked!.date);
                    router.push(`/timetables/${tracking.id}/days/${tracking.unchecked!.date}`);
                  }}
                >
                  <Text style={styles.link}>Check that day</Text>
                </Pressable>
                <Pressable role="button" onPress={() => hide('unchecked', `checked.${tracking.id}`, tracking.unchecked!.date)}>
                  <Text style={styles.link}>No, I attended all</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          <Text style={styles.section} role="heading">
            Today’s classes
          </Text>
          <DayClasses
            timetableId={tracking.id}
            date={today}
            onChanged={refresh}
            empty={(day) => (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No classes today</Text>
                <Text style={styles.emptyBody}>{noClassesText(day.kind, day.label, tracking.next)}</Text>
              </View>
            )}
          />
        </>
      ) : null}
    </TabPage>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 18, fontWeight: '600', color: colors.text, marginTop: space.sm, marginBottom: space.sm },
  notice: { borderRadius: 8, padding: space.lg, marginBottom: space.lg },
  info: { backgroundColor: colors.infoBackground },
  warn: { backgroundColor: tones.warn.background },
  noticeTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: space.xs },
  noticeBody: { fontSize: 14, color: colors.text, lineHeight: 20 },
  noticeAction: { alignSelf: 'flex-end', marginTop: space.sm },
  noticeButtons: { flexDirection: 'row', gap: space.xl, marginTop: space.md, flexWrap: 'wrap' },
  link: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  empty: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: space.xl, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  emptyBody: { fontSize: 14, color: colors.muted, marginTop: space.xs, textAlign: 'center', lineHeight: 20 },
});
