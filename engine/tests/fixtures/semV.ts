import type { CalendarRule, EngineInput, EngineSlot, EngineSubject } from '../../src/index.ts';

export const S = { DWDM: 1, CN: 2, OOAD: 3, ADSA: 4, OOADL: 5, CNL: 6, COI: 7, PCSS: 8, OE: 9, COUN: 10, LIB: 11, INT: 12, SPORTS: 13 } as const;
type Key = keyof typeof S;

export const SUBJECTS: EngineSubject[] = (Object.keys(S) as Key[]).map((key) => ({
  id: S[key],
  countsAttendance: !['COUN', 'LIB', 'INT', 'SPORTS'].includes(key),
  countPerSession: false,
}));

const P = [520, 570, 620, 670, 720, 770, 820, 870, 920];
let nextId = 1;
const at = (weekday: number, key: Key, from: number, to: number, periods = 1): EngineSlot => ({
  id: nextId++,
  weekday,
  startMinute: P[from]!,
  endMinute: P[to]!,
  periods,
  subjectId: S[key],
});

export const SLOTS: EngineSlot[] = [
  at(1, 'OOADL', 0, 3, 3), at(1, 'DWDM', 4, 5), at(1, 'OOAD', 5, 6), at(1, 'CN', 6, 7), at(1, 'COUN', 7, 8),
  at(2, 'CNL', 0, 3, 3), at(2, 'ADSA', 4, 5), at(2, 'CN', 5, 6), at(2, 'INT', 6, 7), at(2, 'LIB', 7, 8),
  at(3, 'OOAD', 0, 1), at(3, 'ADSA', 1, 2), at(3, 'DWDM', 2, 3), at(3, 'PCSS', 4, 7, 3), at(3, 'OE', 7, 8),
  at(4, 'CN', 0, 1), at(4, 'DWDM', 1, 2), at(4, 'COI', 2, 3), at(4, 'ADSA', 4, 5), at(4, 'OOAD', 5, 6), at(4, 'SPORTS', 6, 7), at(4, 'OE', 7, 8),
  at(5, 'COI', 0, 1), at(5, 'ADSA', 1, 2), at(5, 'DWDM', 2, 3), at(5, 'OOAD', 4, 5), at(5, 'CN', 5, 6), at(5, 'INT', 6, 7), at(5, 'OE', 7, 8),
];

export const HOLIDAYS: CalendarRule[] = [
  ['2026-08-15', 'Independence Day'],
  ['2026-08-21', 'Vara Lakshmi Vratham'],
  ['2026-08-25', 'Milad-Un-Nabi'],
  ['2026-09-04', 'Sri Krishnaashtami'],
  ['2026-09-14', 'Vinayaka Chavithi'],
  ['2026-10-02', 'Mahatma Gandhi Jayanthi'],
  ['2026-10-20', 'Vijaya Dasami'],
].map(([date, label]) => ({ kind: 'holiday' as const, startsOn: date!, endsOn: date!, label: label! }));

export const semV = (overrides: Partial<EngineInput> = {}): EngineInput => ({
  startsOn: '2026-07-20',
  endsOn: '2026-11-14',
  requiredBp: 7500,
  condonationBp: 6500,
  subjects: SUBJECTS,
  versions: [{ effectiveFrom: '2026-07-20', slots: SLOTS }],
  calendar: HOLIDAYS,
  marks: [],
  extras: [],
  checkpoint: null,
  now: { date: '2026-09-30', minute: 1440 },
  ...overrides,
});

export const slotAt = (weekday: number, startMinute: number) => SLOTS.find((slot) => slot.weekday === weekday && slot.startMinute === startMinute)!;
