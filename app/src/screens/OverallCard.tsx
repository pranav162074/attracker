import { StyleSheet, Text, View } from 'react-native';
import type { Summary } from '../lib/api.ts';
import { condonationMessage, findLine, missedLine, outlookMessage, sourceNote } from '../lib/dashboard.ts';
import { lineMessage, zoneBadge } from '../lib/format.ts';
import { Badge } from '../ui/Badge.tsx';
import { colors, space } from '../ui/theme.ts';

export const OverallCard = ({ summary }: { summary: Summary }) => {
  const { overall } = summary;
  const badge = overall.held === 0 ? { label: 'Just started', tone: 'neutral' as const } : zoneBadge(overall.zone);
  const counts = overall.held === 0 ? 'Your percentage appears after the first class.' : [`${overall.attended} of ${overall.held} classes attended`, missedLine(overall)].filter(Boolean).join(' · ');
  const messages = overall.held === 0 ? [] : [lineMessage(findLine(overall, 'required')), condonationMessage(overall)].filter((text): text is string => Boolean(text));
  const outlook = outlookMessage(overall);
  const note = sourceNote(summary);

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.label}>Overall</Text>
        {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
      </View>
      <Text style={[styles.percent, overall.percent === null ? styles.empty : null]}>{overall.percent === null ? '–' : `${overall.percentText}%`}</Text>
      <Text style={styles.muted}>{counts}</Text>
      {messages.map((text) => (
        <Text key={text} style={styles.message}>
          {text}
        </Text>
      ))}
      {outlook ? <Text style={styles.outlook}>{outlook}</Text> : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: space.lg, marginBottom: space.lg },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 15, color: colors.muted, fontWeight: '600' },
  percent: { fontSize: 40, fontWeight: '600', color: colors.text, marginTop: space.sm },
  empty: { color: colors.muted },
  muted: { fontSize: 14, color: colors.muted, marginTop: space.xs },
  message: { fontSize: 15, color: colors.text, marginTop: space.md, lineHeight: 21 },
  outlook: { fontSize: 14, color: colors.text, marginTop: space.md, lineHeight: 20 },
  note: { fontSize: 13, color: colors.muted, marginTop: space.md, lineHeight: 18 },
});
