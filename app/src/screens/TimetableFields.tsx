import type { FieldErrors } from '../lib/api.ts';
import type { TimetableForm } from '../lib/setupForms.ts';
import { DateField } from '../ui/DateField.tsx';
import { Muted, SectionTitle } from '../ui/Page.tsx';
import { TextField } from '../ui/TextField.tsx';

type Props = {
  form: TimetableForm;
  errors: FieldErrors;
  onChange: (form: TimetableForm) => void;
};

export const TimetableFields = ({ form, errors, onChange }: Props) => {
  const set = <K extends keyof TimetableForm>(key: K, value: TimetableForm[K]) => onChange({ ...form, [key]: value });
  return (
    <>
      <TextField
        label="Name"
        value={form.name}
        onChangeText={(value) => set('name', value)}
        error={errors.name}
        placeholder="Sem 5"
        maxLength={60}
        autoCapitalize="sentences"
      />
      <DateField label="First day of classes" value={form.startsOn} onChange={(value) => set('startsOn', value)} error={errors.startsOn} />
      <DateField
        label="Last day of classes"
        value={form.endsOn}
        onChange={(value) => set('endsOn', value)}
        error={errors.endsOn}
        near={form.startsOn}
        optional
        hint="Leave empty if it has no fixed end, like a dance class."
      />

      <SectionTitle>Attendance rules</SectionTitle>
      <Muted>Leave these empty if there is no minimum attendance.</Muted>
      <TextField
        label="Required percentage"
        value={form.requiredPercent}
        onChangeText={(value) => set('requiredPercent', value)}
        error={errors.requiredPercent}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="None"
        maxLength={6}
      />
      <TextField
        label="Condonation percentage"
        value={form.condonationPercent}
        onChangeText={(value) => set('condonationPercent', value)}
        error={errors.condonationPercent}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="None"
        maxLength={6}
      />
      <Muted>Between the two, you can still pass by paying condonation. Below the condonation percentage, the term is not allowed.</Muted>
    </>
  );
};
