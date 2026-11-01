import * as XLSX from 'xlsx';
import { HttpError } from '../http/errors.ts';

export type SheetSubject = { code: string | null; name: string; held: number; attended: number };
export type StudentRow = { registration: string; subjects: SheetSubject[]; totalHeld: number | null; totalAttended: number | null };

type Grid = unknown[][];

const text = (value: unknown) => (value === undefined || value === null ? '' : String(value).trim());
const asCount = (value: unknown) => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
};
const normaliseRegistration = (value: unknown) => {
  const raw = typeof value === 'number' ? String(Math.trunc(value)) : text(value);
  return raw.replace(/\s+/g, '').toUpperCase();
};

const readGrid = (file: Buffer): Grid => {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(file, { type: 'buffer', dense: true, cellFormula: false, cellHTML: false, cellStyles: false, sheetRows: 2000 });
  } catch {
    throw new HttpError(400, 'unreadable_sheet', 'This file could not be read as a spreadsheet');
  }
  const first = workbook.SheetNames[0];
  const sheet = first ? workbook.Sheets[first] : undefined;
  if (!sheet) throw new HttpError(400, 'unreadable_sheet', 'The spreadsheet has no sheets');
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true });
};

const findLayout = (grid: Grid) => {
  for (let r = 0; r < Math.min(grid.length, 60); r += 1) {
    const row = grid[r] ?? [];
    const pairs: number[] = [];
    for (let c = 0; c < row.length - 1; c += 1) {
      if (text(row[c]).toUpperCase() === 'H' && text(row[c + 1]).toUpperCase() === 'A') pairs.push(c);
    }
    if (pairs.length === 0) continue;
    const registrationColumn = row.findIndex((cell) => /regist|roll|reg\.?\s*no|admission/i.test(text(cell)));
    if (registrationColumn === -1) continue;

    const subjects: Array<{ column: number; code: string | null; name: string }> = [];
    for (const column of pairs) {
      let title = '';
      for (let up = r - 1; up >= 0 && up >= r - 8 && !title; up -= 1) title = text(grid[up]?.[column]);
      if (!title) continue;
      const match = /^([A-Z0-9]{4,12})\s*[-–:]\s*(.+)$/i.exec(title);
      subjects.push({ column, code: match ? match[1]!.toUpperCase() : null, name: (match ? match[2]! : title).trim() });
    }

    let heldColumn = -1;
    let attendedColumn = -1;
    for (let up = r; up >= Math.max(0, r - 8); up -= 1) {
      (grid[up] ?? []).forEach((cell, c) => {
        const label = text(cell).toLowerCase();
        if (label === 'held' && heldColumn === -1) heldColumn = c;
        if (label === 'attended' && attendedColumn === -1) attendedColumn = c;
      });
    }
    return { headerRow: r, registrationColumn, subjects, heldColumn, attendedColumn };
  }
  throw new HttpError(
    400,
    'unrecognised_sheet',
    'This does not look like an attendance sheet. It needs a registration number column and Held (H) / Attended (A) columns for each subject.'
  );
};

export const readStudentRow = (file: Buffer, registration: string): StudentRow => {
  const grid = readGrid(file);
  const layout = findLayout(grid);
  const wanted = normaliseRegistration(registration);
  const row = grid.slice(layout.headerRow + 1).find((cells) => normaliseRegistration(cells?.[layout.registrationColumn]) === wanted);
  if (!row) throw new HttpError(404, 'student_not_found', `Registration number ${registration} is not in this sheet`);

  const subjects: SheetSubject[] = [];
  for (const subject of layout.subjects) {
    const held = asCount(row[subject.column]);
    const attended = asCount(row[subject.column + 1]);
    if (held === null || attended === null) continue;
    if (attended > held) throw new HttpError(400, 'invalid_sheet', `${subject.name} shows more classes attended than held`);
    subjects.push({ code: subject.code, name: subject.name, held, attended });
  }
  if (subjects.length === 0) throw new HttpError(400, 'invalid_sheet', 'No subject numbers were found for this registration number');

  return {
    registration: wanted,
    subjects,
    totalHeld: layout.heldColumn === -1 ? null : asCount(row[layout.heldColumn]),
    totalAttended: layout.attendedColumn === -1 ? null : asCount(row[layout.attendedColumn]),
  };
};

const STOP = new Set(['and', 'of', 'the', 'to', 'in', 'for', 'a', 'an', '&']);

export const nameTokens = (name: string) =>
  name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^[a-z0-9]{4,12}\s*[-–:]\s*/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token && !STOP.has(token));

const isLab = (tokens: string[]) => tokens.includes('lab') || tokens.includes('laboratory') || tokens.includes('practical');

const similarity = (a: string[], b: string[]) => {
  if (isLab(a) !== isLab(b)) return 0;
  const left = new Set(a);
  const right = new Set(b);
  const shared = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : shared / union;
};

const acronym = (tokens: string[]) => tokens.filter((token) => !['lab', 'laboratory'].includes(token)).map((token) => token[0]).join('');

export const matchSubjects = (
  sheet: SheetSubject[],
  subjects: Array<{ id: number; name: string; shortName: string | null }>
) => {
  const candidates: Array<{ sheetIndex: number; subjectId: number; score: number }> = [];
  sheet.forEach((entry, sheetIndex) => {
    const a = nameTokens(entry.name);
    for (const subject of subjects) {
      const b = nameTokens(subject.name);
      let score = a.join(' ') === b.join(' ') ? 1 : similarity(a, b);
      const short = subject.shortName?.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (short && short.length >= 2 && isLab(a) === isLab(b) && (short === acronym(a) || (isLab(a) && short.replace(/l(ab)?$/, '') === acronym(a)))) {
        score = Math.max(score, 0.9);
      }
      if (score >= 0.5) candidates.push({ sheetIndex, subjectId: subject.id, score });
    }
  });
  candidates.sort((x, y) => y.score - x.score);
  const takenSheet = new Set<number>();
  const takenSubject = new Set<number>();
  const matches = new Map<number, number>();
  for (const candidate of candidates) {
    if (takenSheet.has(candidate.sheetIndex) || takenSubject.has(candidate.subjectId)) continue;
    takenSheet.add(candidate.sheetIndex);
    takenSubject.add(candidate.subjectId);
    matches.set(candidate.sheetIndex, candidate.subjectId);
  }
  return sheet.map((entry, index) => ({ ...entry, subjectId: matches.get(index) ?? null }));
};
