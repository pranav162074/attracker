import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { OverviewItem } from '../lib/api.ts';
import { chooseSemester } from '../currentSemester.ts';
import { colors, space } from '../ui/theme.ts';

type Props = {
  title: string;
  detail?: string | null;
  list: OverviewItem[];
  currentId: number | null;
  onChanged: () => void;
};

const line = (item: OverviewItem) => {
  if (item.status === 'setup') return 'Setting up';
  if (item.held === 0 || item.percent === null) return 'Tracking, no classes held yet';
  return `${item.percentText}% · tracking`;
};

export const SemesterHeader = ({ title, detail, list, currentId, onChanged }: Props) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const current = list.find((item) => item.timetableId === currentId) ?? null;

  const pick = async (id: number) => {
    setOpen(false);
    await chooseSemester(id);
    onChanged();
  };

  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text style={styles.title} role="heading">
          {title}
        </Text>
        {current ? (
          <Pressable role="button" aria-label={`Semester: ${current.name}. Switch semester`} onPress={() => setOpen(true)} style={styles.switch}>
            <Text style={styles.switchText} numberOfLines={1}>
              {current.name} ▾
            </Text>
          </Pressable>
        ) : null}
      </View>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Switch semester</Text>
            <ScrollView style={styles.sheetList}>
              {list.map((item) => {
                const selected = item.timetableId === currentId;
                return (
                  <Pressable
                    key={item.timetableId}
                    role="radio"
                    aria-checked={selected}
                    aria-label={item.name}
                    onPress={() => pick(item.timetableId)}
                    style={[styles.option, selected ? styles.optionSelected : null]}
                  >
                    <View style={styles.optionText}>
                      <Text style={styles.optionName}>{item.name}</Text>
                      <Text style={styles.optionLine}>{line(item)}</Text>
                    </View>
                    {selected ? <Text style={styles.tick}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              role="button"
              onPress={() => {
                setOpen(false);
                router.push('/timetables/new');
              }}
              style={styles.add}
            >
              <Text style={styles.addText}>+ Add a semester</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { marginBottom: space.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  switch: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: space.md, paddingVertical: 6, maxWidth: '55%' },
  switchText: { fontSize: 14, color: colors.text, fontWeight: '500' },
  detail: { fontSize: 14, color: colors.muted, marginTop: space.xs },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: space.lg, paddingBottom: space.xl, width: '100%', maxWidth: 560, alignSelf: 'center', maxHeight: '80%' },
  sheetTitle: { fontSize: 17, fontWeight: '600', color: colors.text, marginBottom: space.md },
  sheetList: { flexGrow: 0 },
  option: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: space.md, marginBottom: space.sm },
  optionSelected: { borderColor: colors.primary, borderWidth: 2 },
  optionText: { flex: 1 },
  optionName: { fontSize: 15, fontWeight: '600', color: colors.text },
  optionLine: { fontSize: 13, color: colors.muted, marginTop: 2 },
  tick: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  add: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: space.md, alignItems: 'center', marginTop: space.xs },
  addText: { fontSize: 15, fontWeight: '600', color: colors.text },
});
