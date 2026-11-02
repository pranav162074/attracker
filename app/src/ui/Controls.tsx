import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { colors, space } from './theme.ts';

type Option<T extends string> = { value: T; label: string };

export const Segmented = <T extends string>({ label, options, value, onChange }: { label: string; options: Option<T>[]; value: T; onChange: (value: T) => void }) => (
  <View style={styles.wrap}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.segments} role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.segment, index > 0 ? styles.segmentDivider : null, selected ? styles.segmentSelected : null]}
          >
            <Text style={[styles.segmentText, selected ? styles.segmentTextSelected : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  </View>
);

export const SwitchRow = ({ label, detail, value, onChange, disabled = false }: { label: string; detail?: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) => (
  <View style={[styles.switchRow, disabled ? styles.disabled : null]}>
    <View style={styles.switchText}>
      <Text style={styles.switchLabel}>{label}</Text>
      {detail ? <Text style={styles.switchDetail}>{detail}</Text> : null}
    </View>
    <Switch value={value} onValueChange={onChange} disabled={disabled} aria-label={label} trackColor={{ true: colors.primary, false: colors.border }} />
  </View>
);

export const ColourPicker = ({ label, colours, value, onChange }: { label: string; colours: string[]; value: string | null; onChange: (value: string) => void }) => (
  <View style={styles.wrap}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.colours} role="radiogroup" aria-label={label}>
      {colours.map((colour) => (
        <Pressable
          key={colour}
          role="radio"
          aria-checked={colour === value}
          aria-label={colour}
          onPress={() => onChange(colour)}
          style={[styles.swatch, { backgroundColor: colour }, colour === value ? styles.swatchSelected : null]}
        />
      ))}
    </View>
  </View>
);

export const ListRow = ({ title, detail, left, right, onPress }: { title: string; detail?: string | null; left?: ReactNode; right?: ReactNode; onPress?: () => void }) => {
  const body = (
    <>
      {left}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {right}
      {onPress ? <Text style={styles.chevron}>›</Text> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable role="button" aria-label={title} onPress={onPress} style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}>
      {body}
    </Pressable>
  );
};

export const ListBox = ({ children }: { children: ReactNode }) => <View style={styles.listBox}>{children}</View>;

export const Dot = ({ colour }: { colour: string | null }) => <View style={[styles.dot, { backgroundColor: colour ?? colors.border }]} />;

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  label: { fontSize: 14, color: colors.text, marginBottom: space.xs, fontWeight: '500' },
  segments: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: 6, overflow: 'hidden' },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.background },
  segmentDivider: { borderLeftWidth: 1, borderLeftColor: colors.border },
  segmentSelected: { backgroundColor: colors.primary },
  segmentText: { fontSize: 15, color: colors.text },
  segmentTextSelected: { color: '#ffffff', fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg },
  switchText: { flex: 1 },
  switchLabel: { fontSize: 15, color: colors.text },
  switchDetail: { fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 18 },
  disabled: { opacity: 0.5 },
  colours: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 3, borderColor: 'transparent' },
  swatchSelected: { borderColor: colors.text },
  listBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' },
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
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, color: colors.text, fontWeight: '500' },
  rowDetail: { fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 18 },
  chevron: { fontSize: 22, color: colors.muted },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
