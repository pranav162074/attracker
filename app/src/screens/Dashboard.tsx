import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Summary } from '../lib/api.ts';
import { condonationMessage, findLine, missedLine, outlookMessage, sourceNote, subjectCount, subjectsFrom, subjectsNote, subjectTone } from '../lib/dashboard.ts';
import { lineMessage, zoneBadge } from '../lib/format.ts';
import { Badge } from '../ui/Badge.tsx';
import { Dot } from '../ui/Controls.tsx';
import { SectionTitle } from '../ui/Page.tsx';
import { colors, space, tones } from '../ui/theme.ts';

export const Dashboard = ({ summary, onOpenSubject }: { summary: Summary; onOpenSubject: (subjectId: number) => void }) => {
  const { overall } = summary;
  const badge = zoneBadge(overall.zone);
  const counts = overall.held === 0 ? 'No classes have been held yet.' : [`${overall.attended} of ${overall.held} attended`, missedLine(overall)].filter(Boolean).join(' · ');
  const messages = overall.held === 0 ? [] : [lineMessage(findLine(overall, 'required')), condonationMessage(overall)].filter((text): text is string => Boolean(text));
  const outlook = outlookMessage(overall);
  const note = sourceNote(summary);
  const since = subjectsFrom(summary);
  const perSubject = subjectsNote(summary);

  return (
    <View>
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.label}>Overall</Text>
          {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
        </View>
        {overall.percent !== null ? <Text style={styles.percent}>{overall.percentText}%</Text> : null}
        <Text style={styles.muted}>{counts}</Text>
        {messages.map((text) => (
          <Text key={text} style={styles.message}>
            {text}
          </Text>
        ))}
        {outlook ? <Text style={styles.outlook}>{outlook}</Text> : null}
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>

      <SectionTitle>Subjects</SectionTitle>
      {perSubject ? <Text style={styles.subjectsNote}>{perSubject}</Text> : null}
      {summary.subjects.length === 0 ? (
        <Text style={styles.muted}>No subjects count for attendance.</Text>
      ) : (
        <View style={styles.list}>
          {summary.subjects.map((row) => {
            const tone = subjectTone(row);
            const message = row.held === 0 ? null : lineMessage(findLine(row, 'required'), row.unitsPerClass);
            return (
              <Pressable
                key={row.subjectId}
                role="button"
                aria-label={row.name}
                onPress={() => onOpenSubject(row.subjectId)}
                style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
              >
                <View style={styles.dot}>
                  <Dot colour={row.colour} />
                </View>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>
                    {row.name}
                    {row.archived ? ' (archived)' : ''}
                  </Text>
                  <Text style={styles.rowDetail}>{subjectCount(row, since)}</Text>
                  {message ? <Text style={styles.rowDetail}>{message}</Text> : null}
                </View>
                <Text style={[styles.rowPercent, { color: tone === 'neutral' ? colors.muted : tones[tone].text }]}>{row.percent === null ? '–' : `${row.percentText}%`}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: space.lg },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 15, color: colors.muted, fontWeight: '600' },
  percent: { fontSize: 40, fontWeight: '600', color: colors.text, marginTop: space.sm },
  muted: { fontSize: 14, color: colors.muted, marginTop: space.xs },
  message: { fontSize: 15, color: colors.text, marginTop: space.md, lineHeight: 21 },
  outlook: { fontSize: 14, color: colors.text, marginTop: space.md, lineHeight: 20 },
  note: { fontSize: 13, color: colors.muted, marginTop: space.md, lineHeight: 18 },
  subjectsNote: { fontSize: 13, color: colors.muted, lineHeight: 18, marginBottom: space.sm },
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dot: { paddingTop: 4 },
  rowMain: { flex: 1 },
  rowPressed: { backgroundColor: colors.surface },
  rowTitle: { fontSize: 15, color: colors.text, fontWeight: '500' },
  rowDetail: { fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 18 },
  rowPercent: { fontSize: 16, fontWeight: '600', minWidth: 64, textAlign: 'right' },
});
