import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { problemFrom } from '../lib/forms.ts';
import { checkReminderTime, DEFAULT_REMINDER_MINUTE, reminderSummary, reminderTimeText } from '../lib/reminders.ts';
import type { ReminderSettings as Settings } from '../lib/reminders.ts';
import { askPermission, notificationsSupported } from '../notifications';
import { loadReminderSettings, saveReminderSettings, syncReminders } from '../reminderSync.ts';
import { Button } from '../ui/Button.tsx';
import { SwitchRow } from '../ui/Controls.tsx';
import { ErrorNotice } from '../ui/Notice.tsx';
import { TextField } from '../ui/TextField.tsx';
import { colors, space } from '../ui/theme.ts';

export const ReminderSettings = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [time, setTime] = useState(reminderTimeText(DEFAULT_REMINDER_MINUTE));
  const [timeError, setTimeError] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    loadReminderSettings().then((loaded) => {
      if (!active) return;
      setSettings(loaded);
      setTime(reminderTimeText(loaded.minute));
    });
    return () => {
      active = false;
    };
  }, []);

  if (!notificationsSupported) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title} role="heading">
          Reminders
        </Text>
        <Text style={styles.note}>Reminders are part of the Android app. The website cannot send them.</Text>
      </View>
    );
  }
  if (!settings) return null;

  const apply = async (next: Settings) => {
    setBusy(true);
    setMessage(null);
    try {
      if (next.enabled && !(await askPermission())) {
        setMessage('Notifications are turned off for attracker. Turn them on in your phone’s settings, then try again.');
        setBusy(false);
        return;
      }
      await saveReminderSettings(next);
      setSettings(next);
      setScheduled(await syncReminders());
    } catch (error) {
      setMessage(problemFrom(error).message ?? 'Could not set the reminders.');
    }
    setBusy(false);
  };

  const saveTime = () => {
    const { minute, error } = checkReminderTime(time);
    setTimeError(error ?? undefined);
    if (minute === null) return;
    setTime(reminderTimeText(minute));
    apply({ ...settings, minute });
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title} role="heading">
        Reminders
      </Text>
      <SwitchRow
        label="Remind me to mark attendance"
        detail={reminderSummary(settings, scheduled)}
        value={settings.enabled}
        onChange={(enabled) => apply({ ...settings, enabled })}
        disabled={busy}
      />
      {settings.enabled ? (
        <View style={styles.time}>
          <View style={styles.timeField}>
            <TextField label="Remind me at" value={time} onChangeText={setTime} error={timeError} placeholder="5:00 pm" autoCorrect={false} maxLength={10} />
          </View>
          <View style={styles.timeButton}>
            <Button title="Save time" variant="secondary" onPress={saveTime} busy={busy} />
          </View>
        </View>
      ) : null}
      <ErrorNotice message={message} />
      <Text style={styles.note}>Only on days that have classes, so holidays stay quiet. Reminders are planned two weeks ahead and topped up each time you open the app.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginTop: space.xxl, borderTopWidth: 1, borderTopColor: colors.surface, paddingTop: space.xl },
  title: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: space.md },
  time: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  timeField: { flex: 1 },
  timeButton: { marginTop: 22 },
  note: { fontSize: 13, color: colors.muted, lineHeight: 18 },
});
