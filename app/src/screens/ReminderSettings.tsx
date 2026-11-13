import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { problemFrom } from '../lib/forms.ts';
import { reminderSummary } from '../lib/reminders.ts';
import type { ReminderSettings as Settings } from '../lib/reminders.ts';
import { askPermission, notificationsSupported } from '../notifications';
import { loadReminderSettings, saveReminderSettings, syncReminders } from '../reminderSync.ts';
import { SwitchRow } from '../ui/Controls.tsx';
import { ErrorNotice } from '../ui/Notice.tsx';
import { colors, space } from '../ui/theme.ts';

export const ReminderSettings = () => {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    loadReminderSettings().then((loaded) => {
      if (active) setSettings(loaded);
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

  return (
    <View style={styles.wrap}>
      <Text style={styles.title} role="heading">
        Reminders
      </Text>
      <SwitchRow
        label="Notify me when a class ends"
        detail={reminderSummary(settings, scheduled)}
        value={settings.enabled}
        onChange={(enabled) => apply({ enabled })}
        disabled={busy}
      />
      <ErrorNotice message={message} />
      <Text style={styles.note}>
        When a class that counts for attendance ends, you get a notification with Present, Absent and Cancelled buttons, so you can mark it without opening the app. If you leave it, the class stays Present.
      </Text>
      <Text style={[styles.note, styles.gap]}>Holidays, cancelled classes and classes you already marked as missed stay quiet. Reminders are planned two weeks ahead and topped up each time you open the app.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {},
  title: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: space.md },
  note: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  gap: { marginTop: space.sm },
});
