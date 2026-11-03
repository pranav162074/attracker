import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../session.tsx';
import type { OverviewItem, TodayClass } from '../../lib/api.ts';
import { classTitle, formatClock, formatDay, localDate, overviewLine, requiredMessage, statusText, statusTone, zoneBadge } from '../../lib/format.ts';
import { useLoad } from '../../useLoad.ts';
import { OfflineNotice } from '../../ui/OfflineNotice.tsx';
import { Badge } from '../../ui/Badge.tsx';
import { Button } from '../../ui/Button.tsx';
import { ErrorNotice } from '../../ui/Notice.tsx';
import { colors, space } from '../../ui/theme.ts';

const loadHome = async () => {
  const [timetables, today] = await Promise.all([api.overview(), api.today()]);
  return { timetables, today };
};

const TodayRow = ({ item, showTimetable, onPress }: { item: TodayClass; showTimetable: boolean; onPress: () => void }) => (
  <Pressable role="button" aria-label={`${classTitle(item)} at ${formatClock(item.start)}`} onPress={onPress} style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}>
    <Text style={styles.time}>{formatClock(item.start)}</Text>
    <View style={styles.rowMain}>
      <Text style={[styles.rowTitle, item.status === 'cancelled' ? styles.struck : null]}>{classTitle(item)}</Text>
      <Text style={styles.rowSub}>
        Until {formatClock(item.end)}
        {showTimetable ? ` · ${item.timetableName}` : ''}
      </Text>
    </View>
    <Badge label={statusText(item)} tone={statusTone(item)} />
  </Pressable>
);

const TimetableCard = ({ item, onPress }: { item: OverviewItem; onPress: () => void }) => {
  const badge = item.status === 'setup' ? { label: 'Setting up', tone: 'neutral' as const } : zoneBadge(item.zone);
  const message = item.status === 'tracking' && item.held > 0 ? requiredMessage(item.required) : null;
  return (
    <Pressable role="button" aria-label={item.name} onPress={onPress} style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}>
      <View style={styles.cardTop}>
        <Text style={styles.cardName}>{item.name}</Text>
        {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
      </View>
      {item.status === 'tracking' && item.percent !== null ? <Text style={styles.percent}>{item.percentText}%</Text> : null}
      <Text style={styles.cardLine}>{overviewLine(item)}</Text>
      {message ? <Text style={styles.cardMessage}>{message}</Text> : null}
    </Pressable>
  );
};

export default function Home() {
  const router = useRouter();
  const { data, error, loading, refreshing, refresh, savedAt } = useLoad(loadHome, 'home');
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
          <OfflineNotice savedAt={savedAt} />
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
                <TodayRow
                  key={`${item.timetableId}-${item.key}`}
                  item={item}
                  showTimetable={timetableCount > 1}
                  onPress={() => router.push(item.tracking ? `/timetables/${item.timetableId}/days/${item.date}` : `/timetables/${item.timetableId}`)}
                />
              ))}
            </View>
          )}

          <Text style={[styles.section, styles.sectionGap]} role="heading">
            Timetables
          </Text>
          {data.timetables.length === 0 ? (
            <Text style={styles.empty}>You have no timetables yet. Add your college timetable first, then anything else you attend, like tuition or dance.</Text>
          ) : (
            data.timetables.map((item) => <TimetableCard key={item.timetableId} item={item} onPress={() => router.push(`/timetables/${item.timetableId}`)} />)
          )}
          <View style={styles.newButton}>
            <Button title="New timetable" variant={data.timetables.length === 0 ? 'primary' : 'secondary'} onPress={() => router.push('/timetables/new')} />
          </View>
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
  empty: { fontSize: 15, color: colors.muted, lineHeight: 21 },
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
  rowPressed: { backgroundColor: colors.surface },
  time: { width: 64, fontSize: 14, color: colors.muted },
  rowMain: { flex: 1 },
  rowTitle: { fontSize: 15, color: colors.text, fontWeight: '500' },
  rowSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  struck: { textDecorationLine: 'line-through', color: colors.muted },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: space.lg, marginBottom: space.md, backgroundColor: colors.background },
  cardPressed: { backgroundColor: colors.surface },
  newButton: { marginTop: space.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.md },
  cardName: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  percent: { fontSize: 32, fontWeight: '600', color: colors.text, marginTop: space.sm },
  cardLine: { fontSize: 14, color: colors.muted, marginTop: space.xs },
  cardMessage: { fontSize: 14, color: colors.text, marginTop: space.sm, lineHeight: 20 },
});
