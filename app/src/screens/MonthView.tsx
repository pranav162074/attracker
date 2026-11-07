import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../session.tsx';
import type { DayOverview } from '../lib/api.ts';
import { formatDate, WEEKDAY_LETTERS } from '../lib/dates.ts';
import { localDate } from '../lib/format.ts';
import { cellLook, cellNote, gridRange, monthParam, monthTitle, monthTotals, neighbour, parseMonthParam } from '../lib/month.ts';
import type { CellLook } from '../lib/month.ts';
import { useLoad } from '../useLoad.ts';
import { OfflineNotice } from '../ui/OfflineNotice.tsx';
import { LoadFailed, Loading, Muted } from '../ui/Page.tsx';
import { colors, space, tones } from '../ui/theme.ts';

const loadMonth = async (id: number, keyText: string) => {
  const key = parseMonthParam(keyText, keyText);
  const { from, to } = gridRange(key);
  const [timetable, range] = await Promise.all([api.timetable(id), api.days(id, from, to)]);
  return { timetable, range, key };
};

const looks: Record<CellLook, { background: string; text: string }> = {
  outside: { background: 'transparent', text: colors.disabled },
  holiday: { background: colors.surface, text: colors.muted },
  absent: { background: tones.bad.background, text: tones.bad.text },
  present: { background: tones.good.background, text: tones.good.text },
  cancelled: { background: colors.surface, text: colors.muted },
  upcoming: { background: colors.background, text: colors.text },
  empty: { background: colors.background, text: colors.muted },
};

const Legend = () => (
  <View style={styles.legend}>
    {(
      [
        ['present', 'All attended'],
        ['absent', 'Missed some'],
        ['holiday', 'Holiday or no classes held'],
      ] as const
    ).map(([look, label]) => (
      <View key={look} style={styles.legendItem}>
        <View style={[styles.legendSwatch, { backgroundColor: looks[look].background }]} />
        <Text style={styles.legendText}>{label}</Text>
      </View>
    ))}
  </View>
);

export const MonthView = ({ timetableId, month, onMonth }: { timetableId: number; month: string | undefined; onMonth: (month: string) => void }) => {
  const router = useRouter();
  const today = localDate();
  const keyText = monthParam(parseMonthParam(month, today));
  const thisMonth = monthParam(parseMonthParam(undefined, today));
  const load = useCallback(() => loadMonth(timetableId, keyText), [timetableId, keyText]);
  const { data, error, loading, refreshing, refresh, savedAt } = useLoad(load, `month.${timetableId}.${keyText}`);
  const key = parseMonthParam(keyText, keyText);

  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;

  const { range } = data;
  const stale = monthParam(data.key) !== keyText;
  const byDate = new Map<string, DayOverview>(range.days.map((day) => [day.date, day]));
  const { weeks } = gridRange(key);
  const totals = monthTotals(range.days, key);
  const go = (by: number) => onMonth(monthParam(neighbour(key, by)));

  return (
    <View>
      <OfflineNotice savedAt={savedAt} />
      <View style={styles.bar}>
        <Pressable role="button" aria-label="Previous month" onPress={() => go(-1)} style={styles.arrow}>
          <Text style={styles.arrowText}>‹</Text>
        </Pressable>
        <Text style={styles.title} role="heading">
          {monthTitle(key)}
        </Text>
        <Pressable role="button" aria-label="Next month" onPress={() => go(1)} style={styles.arrow}>
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
            const day = cell.inMonth ? byDate.get(cell.iso) : undefined;
            const look = stale ? 'empty' : cellLook(day);
            const note = stale ? null : cellNote(day);
            const colours = looks[look];
            const tappable = cell.inMonth && look !== 'outside';
            return (
              <Pressable
                key={cell.iso}
                role="button"
                aria-label={`${formatDate(cell.iso)}${note ? `, ${note}` : ''}`}
                disabled={!tappable}
                onPress={() => router.push(`/timetables/${timetableId}/days/${cell.iso}`)}
                style={[styles.cell, { backgroundColor: cell.inMonth ? colours.background : 'transparent' }, cell.iso === today ? styles.today : null]}
              >
                {cell.inMonth ? (
                  <>
                    <Text style={[styles.dayNumber, { color: colours.text }]}>{cell.day}</Text>
                    <Text style={[styles.note, { color: colours.text }]} numberOfLines={1}>
                      {note ?? ' '}
                    </Text>
                  </>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}

      <Legend />
      {stale ? null : (
        <View style={styles.totals}>
          {totals.held > 0 ? (
            <Text style={styles.totalsMain}>
              This month: {totals.attended} of {totals.held} attended
            </Text>
          ) : (
            <Text style={styles.totalsMain}>No classes held this month.</Text>
          )}
          <Text style={styles.totalsDetail}>
            {[totals.absentDays > 0 ? `missed classes on ${totals.absentDays} ${totals.absentDays === 1 ? 'day' : 'days'}` : null, totals.holidays > 0 ? `${totals.holidays} ${totals.holidays === 1 ? 'holiday' : 'holidays'}` : null]
              .filter(Boolean)
              .join(', ') || ' '}
          </Text>
        </View>
      )}
      {thisMonth !== keyText ? (
        <Pressable role="button" onPress={() => onMonth(thisMonth)} style={styles.thisMonth}>
          <Text style={styles.thisMonthText}>Back to this month</Text>
        </Pressable>
      ) : null}
      <Muted>Tap a day to see its classes and mark them. Numbers like −3 are the classes missed that day; a lab counts each period, so missing a 3-period lab shows −3. {range.checkpoint ? `Days up to ${formatDate(range.checkpoint.asOf)} are covered by the official numbers you entered.` : ''}</Muted>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 28, color: colors.primary },
  title: { fontSize: 18, fontWeight: '600', color: colors.text },
  week: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, color: colors.muted, paddingVertical: space.xs },
  cell: { flex: 1, minHeight: 52, borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  today: { borderWidth: 2, borderColor: colors.primary },
  dayNumber: { fontSize: 15, fontWeight: '600' },
  note: { fontSize: 11, marginTop: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  legendSwatch: { width: 14, height: 14, borderRadius: 3, borderWidth: 1, borderColor: colors.border },
  legendText: { fontSize: 12, color: colors.muted },
  totals: { marginTop: space.lg, marginBottom: space.md },
  totalsMain: { fontSize: 16, fontWeight: '600', color: colors.text },
  totalsDetail: { fontSize: 13, color: colors.muted, marginTop: 2 },
  thisMonth: { alignSelf: 'flex-start', paddingVertical: space.sm, marginBottom: space.sm },
  thisMonthText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
});
