import { useCallback, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { api } from '../../../../../session.tsx';
import { ApiError } from '../../../../../lib/api.ts';
import type { CalendarDay, FieldErrors, Timetable } from '../../../../../lib/api.ts';
import { checkDayForm, dayFormFrom, newDayForm } from '../../../../../lib/calendar.ts';
import type { DayForm, DayType, HalfKind } from '../../../../../lib/calendar.ts';
import { problemFrom } from '../../../../../lib/forms.ts';
import { friendlyDates, isRealIso } from '../../../../../lib/dates.ts';
import { localDate } from '../../../../../lib/format.ts';
import { parseTime, showTime, WEEKDAY_SHORT } from '../../../../../lib/grid.ts';
import { useLoad } from '../../../../../useLoad.ts';
import { Button } from '../../../../../ui/Button.tsx';
import { ConfirmButton } from '../../../../../ui/ConfirmButton.tsx';
import { Segmented } from '../../../../../ui/Controls.tsx';
import { DateField } from '../../../../../ui/DateField.tsx';
import { ErrorNotice } from '../../../../../ui/Notice.tsx';
import { LoadFailed, Loading, Muted, Page } from '../../../../../ui/Page.tsx';
import { TextField } from '../../../../../ui/TextField.tsx';
import { space } from '../../../../../ui/theme.ts';

const TYPES: { value: DayType; label: string }[] = [
  { value: 'holiday', label: 'Holiday' },
  { value: 'half', label: 'Half day' },
  { value: 'follows', label: 'Swapped day' },
];

const HALVES: { value: HalfKind; label: string }[] = [
  { value: 'no_classes_after', label: 'Morning only' },
  { value: 'no_classes_before', label: 'Afternoon only' },
];

const WEEKDAYS = [1, 2, 3, 4, 5, 6].map((day) => ({ value: String(day), label: WEEKDAY_SHORT[day - 1]! }));

const Editor = ({ timetable, day, date }: { timetable: Timetable; day: CalendarDay | null; date: string | null }) => {
  const router = useRouter();
  const [form, setForm] = useState<DayForm>(() => (day ? dayFormFrom(day) : { ...newDayForm(), startsOn: date, endsOn: date }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof DayForm>(key: K, value: DayForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    const { input, errors: problems } = checkDayForm(form, timetable);
    setErrors(problems);
    setMessage(null);
    if (!input) return;
    setBusy(true);
    try {
      if (day) await api.updateDay(timetable.id, day.id, input);
      else await api.addDay(timetable.id, input);
      router.back();
    } catch (error) {
      const problem = problemFrom(error);
      setErrors(problem.fields);
      setMessage(error instanceof ApiError && error.code === 'day_taken' ? `${friendlyDates(error.message)}. Edit that entry instead.` : problem.message && friendlyDates(problem.message));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!day) return;
    try {
      await api.deleteDay(timetable.id, day.id);
      router.back();
    } catch (error) {
      setMessage(problemFrom(error).message);
    }
  };

  const cutoff = parseTime(form.cutoff);
  const today = localDate();
  const near = today < timetable.startsOn ? timetable.startsOn : timetable.endsOn && today > timetable.endsOn ? timetable.endsOn : today;

  return (
    <Page>
      <Stack.Screen options={{ title: day ? 'Edit day' : 'Add a day' }} />
      <ErrorNotice message={message} />
      <Segmented label="What kind of day" options={TYPES} value={form.type} onChange={(type) => set('type', type)} />

      {form.type === 'holiday' ? (
        <>
          <DateField label="First day" value={form.startsOn} onChange={(value) => set('startsOn', value)} error={errors.startsOn} near={near} />
          <DateField
            label="Last day"
            value={form.endsOn}
            onChange={(value) => set('endsOn', value)}
            error={errors.endsOn}
            near={form.startsOn}
            optional
            hint="Only for breaks longer than a day, like exam weeks or Dasara holidays."
          />
        </>
      ) : (
        <DateField label="Date" value={form.startsOn} onChange={(value) => set('startsOn', value)} error={errors.startsOn} near={near} />
      )}

      {form.type === 'half' ? (
        <>
          <Segmented label="Classes on this day" options={HALVES} value={form.halfKind} onChange={(value) => set('halfKind', value)} />
          <TextField
            label={form.halfKind === 'no_classes_after' ? 'Classes stop at' : 'Classes start at'}
            value={form.cutoff}
            onChangeText={(value) => set('cutoff', value)}
            error={errors.cutoff}
            hint={cutoff !== null && !/[ap]\.?m/i.test(form.cutoff) ? `Reads as ${showTime(cutoff)}` : null}
            placeholder="12:00"
            autoCorrect={false}
            maxLength={10}
          />
        </>
      ) : null}

      {form.type === 'follows' ? (
        <>
          <Segmented label="Follows the timetable of" options={WEEKDAYS} value={String(form.followsWeekday)} onChange={(value) => set('followsWeekday', Number(value))} />
          <Muted>For example, a Saturday that runs Monday’s classes.</Muted>
        </>
      ) : null}

      <TextField label="Note (optional)" value={form.label} onChangeText={(value) => set('label', value)} error={errors.label} placeholder={form.type === 'holiday' ? 'Diwali' : 'Instead of 2 Oct'} maxLength={80} />
      <Button title={day ? 'Save' : 'Add'} onPress={save} busy={busy} />
      {day ? (
        <View style={styles.remove}>
          <ConfirmButton title="Remove this day" question="Remove this entry? The day goes back to its normal timetable." confirmTitle="Remove" onConfirm={remove} />
        </View>
      ) : null}
    </Page>
  );
};

const loadExisting = async (timetableId: number, dayId: number | null) => {
  const [timetable, days] = await Promise.all([api.timetable(timetableId), dayId === null ? Promise.resolve([]) : api.calendar(timetableId)]);
  const day = dayId === null ? null : days.find((item) => item.id === dayId);
  if (day === undefined) throw new ApiError(404, 'not_found', 'This day no longer exists.');
  return { timetable, day };
};

export default function DayScreen() {
  const { id, dayId, date } = useLocalSearchParams<{ id: string; dayId: string; date?: string }>();
  const timetableId = Number(id);
  const existing = dayId === 'new' ? null : Number(dayId);
  const load = useCallback(() => loadExisting(timetableId, existing), [timetableId, existing]);
  const { data, error, loading, refreshing, refresh } = useLoad(load);
  if (loading) return <Loading />;
  if (!data) return <LoadFailed message={error} onRetry={refresh} busy={refreshing} />;
  return <Editor timetable={data.timetable} day={data.day} date={typeof date === 'string' && isRealIso(date) ? date : null} />;
}

const styles = StyleSheet.create({
  remove: { marginTop: space.xl },
});
