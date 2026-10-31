export const SUBJECTS = [
  { key: 'DWDM', name: 'Data Warehousing and Data Mining', kind: 'theory' },
  { key: 'CN', name: 'Computer Networks', kind: 'theory' },
  { key: 'OOAD', name: 'Object Oriented Analysis and Design', kind: 'theory' },
  { key: 'ADSA', name: 'Advanced Data Structures & Algorithms', kind: 'theory' },
  { key: 'OOADL', name: 'Object Oriented Analysis and Design Lab', kind: 'lab' },
  { key: 'CNL', name: 'Computer Networks Lab', kind: 'lab' },
  { key: 'COI', name: 'Constitution of India', kind: 'theory' },
  { key: 'PCSS', name: 'Professional Communication & Soft Skills Lab', kind: 'lab' },
  { key: 'OE', name: 'Introduction to Cloud Computing', kind: 'theory' },
  { key: 'COUN', name: 'Counseling', kind: 'other' },
  { key: 'LIB', name: 'Library', kind: 'other' },
  { key: 'INT', name: 'Internships', kind: 'other' },
  { key: 'SPORTS', name: 'Sports', kind: 'other' },
] as const;

export type SubjectKey = (typeof SUBJECTS)[number]['key'];

const P = ['08:40', '09:30', '10:20', '11:10', '12:00', '12:50', '13:40', '14:30', '15:20'] as const;

const at = (weekday: number, subject: SubjectKey, from: number, to: number, periods = 1) => ({
  weekday,
  start: P[from]!,
  end: P[to]!,
  periods,
  subject,
});

export const GRID = [
  at(1, 'OOADL', 0, 3, 3), at(1, 'DWDM', 4, 5), at(1, 'OOAD', 5, 6), at(1, 'CN', 6, 7), at(1, 'COUN', 7, 8),
  at(2, 'CNL', 0, 3, 3), at(2, 'ADSA', 4, 5), at(2, 'CN', 5, 6), at(2, 'INT', 6, 7), at(2, 'LIB', 7, 8),
  at(3, 'OOAD', 0, 1), at(3, 'ADSA', 1, 2), at(3, 'DWDM', 2, 3), at(3, 'PCSS', 4, 7, 3), at(3, 'OE', 7, 8),
  at(4, 'CN', 0, 1), at(4, 'DWDM', 1, 2), at(4, 'COI', 2, 3), at(4, 'ADSA', 4, 5), at(4, 'OOAD', 5, 6), at(4, 'SPORTS', 6, 7), at(4, 'OE', 7, 8),
  at(5, 'COI', 0, 1), at(5, 'ADSA', 1, 2), at(5, 'DWDM', 2, 3), at(5, 'OOAD', 4, 5), at(5, 'CN', 5, 6), at(5, 'INT', 6, 7), at(5, 'OE', 7, 8),
];
