import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../session.tsx';
import type { OverviewItem, TodayClass } from '../lib/api.ts';
import { classTitle, formatClock, formatDay, localDate, overviewLine, requiredMessage, statusText, statusTone, zoneBadge } from '../lib/format.ts';
import { useLoad } from '../useLoad.ts';
import { Badge } from '../ui/Badge.tsx';
import { Button } from '../ui/Button.tsx';
import { ErrorNotice } from '../ui/Notice.tsx';
import { colors, space } from '../ui/theme.ts';

const loadHome = async () => {
  const [timetables, today] = await Promise.all([api.overview(), api.today()]);
  return { timetables, today };
};

const TodayRow = ({ item, showTimetable }: { item: TodayClass; showTimetable: boolean }) => (
  <View style={styles.row}>
    <Text style={styles.time}>{formatClock(item.start)}</Text>
    <View style={styles.rowMain}>
      <Text style={[styles.rowTitle, item.status === 'cancelled' ? styles.struck : null]}>{classTitle(item)}</Text>
      <Text style={styles.rowSub}>
        Until {formatClock(item.end)}
        {showTimetable ? ` · ${item.timetableName}` : ''}
      </Text>
    </View>
    <Badge label={statusText(item)} tone={statusTone(item)} />
  </View>
);

const TimetableCard = ({ item }: { item: OverviewItem }) => {
  const badge = item.status === 'setup' ? { label: 'Setting up', tone: 'neutral' as const } : zoneBadge(item.zone);
  const message = item.status === 'tracking' && item.held > 0 ? requiredMessage(item.required) : null;
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardName}>{item.name}</Text>
        {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
      </View>
      {item.status === 'tracking' && item.percent !== null ? <Text style={styles.percent}>{item.percentText}%</Text> : null}
      <Text style={styles.cardLine}>{overviewLine(item)}</Text>
      {message ? <Text style={styles.cardMessage}>{message}</Text> : null}
    </View>
  );
};

export default function Home() {
  const { data, error, loading, refreshing, refresh } = useLoad(loadHome);
  const todayDate = data?.today[0]?.date ?? localDate();
  const timetableCount = new Set(data?.today.map((item) => item.timetableId)).size;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.brand}>attracker</Text>
        <Link href="/account" style={styles.headerLink}>
          Account
        </Link>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !data ? (
        <View style={styles.body}>
          <ErrorNotice message={error} />
          <Button title="Try again" onPress={refresh} busy={refreshing} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
          <ErrorNotice message={error} />

          <Text style={styles.section} role="heading">
            Today
          </Text>
          <Text style={styles.sectionSub}>{formatDay(todayDate)}</Text>
          {data.today.length === 0 ? (
            <Text style={styles.empty}>No classes today.</Text>
          ) : (
            <View style={styles.list}>
              {data.today.map((item) => (
                <TodayRow key={`${item.timetableId}-${item.key}`} item={item} showTimetable={timetableCount > 1} />
              ))}
            </View>
          )}

          <Text style={[styles.section, styles.sectionGap]} role="heading">
            Timetables
          </Text>
          {data.timetables.length === 0 ? (
            <Text style={styles.empty}>You have no timetables yet.</Text>
          ) : (
            data.timetables.map((item) => <TimetableCard key={item.timetableId} item={item} />)
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  brand: { fontSize: 17, fontWeight: '700', color: colors.primary },
  headerLink: { fontSize: 15, color: colors.primary, fontWeight: '600', padding: space.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: space.xl, paddingBottom: space.xxl, width: '100%', maxWidth: 640, alignSelf: 'center' },
  section: { fontSize: 20, fontWeight: '600', color: colors.text },
  sectionGap: { marginTop: space.xxl, marginBottom: space.md },
  sectionSub: { fontSize: 14, color: colors.muted, marginTop: 2, marginBottom: space.md },
  empty: { fontSize: 15, color: colors.muted },
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  time: { width: 64, fontSize: 14, color: colors.muted },
  rowMain: { flex: 1 },
  rowTitle: { fontSize: 15, color: colors.text, fontWeight: '500' },
  rowSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  struck: { textDecorationLine: 'line-through', color: colors.muted },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: space.lg, marginBottom: space.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.md },
  cardName: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  percent: { fontSize: 32, fontWeight: '600', color: colors.text, marginTop: space.sm },
  cardLine: { fontSize: 14, color: colors.muted, marginTop: space.xs },
  cardMessage: { fontSize: 14, color: colors.text, marginTop: space.sm, lineHeight: 20 },
});
