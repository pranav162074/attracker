import { useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../session.tsx';
import { problemFrom } from '../lib/forms.ts';
import { blockedBy, neighbourStep, SETUP_STEPS, setupPath, stepNumber } from '../lib/semester.ts';
import type { SetupRoute } from '../lib/semester.ts';
import { Button } from '../ui/Button.tsx';
import { ErrorNotice } from '../ui/Notice.tsx';
import { colors, space } from '../ui/theme.ts';

export const SetupProgress = ({ route }: { route: SetupRoute }) => {
  const number = stepNumber(route);
  return (
    <View style={styles.progress} aria-label={`Step ${number} of ${SETUP_STEPS}`}>
      <View style={styles.bars}>
        {Array.from({ length: SETUP_STEPS }, (_, index) => (
          <View key={index} style={[styles.bar, index < number ? styles.barDone : null]} />
        ))}
      </View>
      <Text style={styles.stepText}>
        Step {number} of {SETUP_STEPS}
      </Text>
    </View>
  );
};

type FooterProps = {
  timetableId: number;
  route: SetupRoute;
  nextLabel?: string;
  beforeNext?: () => Promise<boolean>;
};

export const SetupFooter = ({ timetableId, route, nextLabel = 'Next', beforeNext }: FooterProps) => {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const previous = neighbourStep(route, -1);
  const next = neighbourStep(route, 1);

  const goNext = async () => {
    if (!next) return;
    setBusy(true);
    setMessage(null);
    try {
      if (beforeNext && !(await beforeNext())) {
        setBusy(false);
        return;
      }
      const problem = blockedBy(route, (await api.setup(timetableId)).steps);
      if (problem) {
        setMessage(problem);
        setBusy(false);
        return;
      }
      router.replace(setupPath(timetableId, next));
    } catch (failure) {
      setMessage(problemFrom(failure).message);
      setBusy(false);
    }
  };

  return (
    <View style={styles.footer}>
      <ErrorNotice message={message} />
      <View style={styles.buttons}>
        {previous ? (
          <View style={styles.button}>
            <Button title="Back" variant="secondary" onPress={() => router.replace(setupPath(timetableId, previous))} />
          </View>
        ) : null}
        <View style={styles.button}>
          <Button title={nextLabel} onPress={goNext} busy={busy} />
        </View>
      </View>
    </View>
  );
};

export const SetupIntro = ({ title, children }: { title: string; children: ReactNode }) => (
  <View style={styles.intro}>
    <Text style={styles.title} role="heading">
      {title}
    </Text>
    <Text style={styles.lead}>{children}</Text>
  </View>
);

const styles = StyleSheet.create({
  progress: { marginBottom: space.lg },
  bars: { flexDirection: 'row', gap: 6 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.surface },
  barDone: { backgroundColor: colors.primary },
  stepText: { fontSize: 13, color: colors.muted, marginTop: space.sm },
  footer: { marginTop: space.xl, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: colors.surface },
  buttons: { flexDirection: 'row', gap: space.md },
  button: { flex: 1 },
  intro: { marginBottom: space.lg },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: space.xs },
  lead: { fontSize: 15, color: colors.muted, lineHeight: 22 },
});
