import type { PoolClient } from 'pg';
import { query, withTransaction } from '../db/pool.ts';
import { HttpError } from '../http/errors.ts';
import type { PutGrid, SlotInput } from './schemas.ts';
import { todayIn, toClock, WEEKDAYS } from './time.ts';

type VersionRow = { id: number; effective_from: string; effective_until: string | null; slot_count: number };
type SlotRow = { id: number; weekday: number; start_minute: number; end_minute: number; periods: number; subject_id: number };

const toSlot = (row: SlotRow) => ({
  id: row.id,
  weekday: row.weekday,
  start: toClock(row.start_minute),
  end: toClock(row.end_minute),
  periods: row.periods,
  subjectId: row.subject_id,
});

const toVersion = (row: VersionRow) => ({
  id: row.id,
  effectiveFrom: row.effective_from,
  effectiveUntil: row.effective_until,
  slotCount: row.slot_count,
});

const timetableNotFound = () => new HttpError(404, 'not_found', 'Timetable not found');

const VERSIONS_SQL = `
  SELECT v.id, v.effective_from,
         (lead(v.effective_from) OVER (ORDER BY v.effective_from) - 1)::date::text AS effective_until,
         (SELECT count(*)::int FROM grid_slots s WHERE s.version_id = v.id) AS slot_count
    FROM grid_versions v
   WHERE v.timetable_id = $1
   ORDER BY v.effective_from`;

const SLOTS_SQL = `
  SELECT id, weekday, start_minute, end_minute, periods, subject_id
    FROM grid_slots WHERE version_id = $1 ORDER BY weekday, start_minute`;

const ownedTimetable = async (userId: number, timetableId: number) => {
  const rows = await query<{ time_zone: string }>('SELECT time_zone FROM timetables WHERE id = $1 AND user_id = $2', [timetableId, userId]);
  if (!rows[0]) throw timetableNotFound();
  return rows[0];
};

export const listVersions = async (userId: number, timetableId: number) => {
  await ownedTimetable(userId, timetableId);
  return (await query<VersionRow>(VERSIONS_SQL, [timetableId])).map(toVersion);
};

export const getGrid = async (userId: number, timetableId: number, on: string | undefined) => {
  const { time_zone: timeZone } = await ownedTimetable(userId, timetableId);
  const versions = await query<VersionRow>(VERSIONS_SQL, [timetableId]);
  const date = on ?? todayIn(timeZone);
  const current = [...versions].reverse().find((version) => version.effective_from <= date) ?? (on === undefined ? versions[0] : undefined);
  if (!current) return { on: date, version: null, slots: [] };
  const slots = await query<SlotRow>(SLOTS_SQL, [current.id]);
  return { on: date, version: toVersion(current), slots: slots.map(toSlot) };
};

const lockTimetable = async (client: PoolClient, userId: number, timetableId: number) => {
  const { rows } = await client.query<{ starts_on: string; ends_on: string | null }>(
    'SELECT starts_on, ends_on FROM timetables WHERE id = $1 AND user_id = $2 FOR UPDATE',
    [timetableId, userId]
  );
  if (!rows[0]) throw timetableNotFound();
  return rows[0];
};

const checkSubjects = async (client: PoolClient, timetableId: number, slots: SlotInput[]) => {
  const ids = [...new Set(slots.map((slot) => slot.subjectId))];
  if (ids.length === 0) return;
  const { rows } = await client.query<{ id: number; name: string; archived: boolean }>(
    'SELECT id, name, archived_at IS NOT NULL AS archived FROM subjects WHERE timetable_id = $1 AND id = ANY($2::bigint[])',
    [timetableId, ids]
  );
  const found = new Map(rows.map((row) => [row.id, row]));
  for (const id of ids) {
    const subject = found.get(id);
    if (!subject) throw new HttpError(400, 'validation_error', `Subject ${id} is not part of this timetable`);
    if (subject.archived) throw new HttpError(400, 'validation_error', `${subject.name} is archived. Unarchive it to use it in the grid.`);
  }
};

const describeSlot = (slot: SlotRow) => `${WEEKDAYS[slot.weekday - 1]} ${toClock(slot.start_minute)}–${toClock(slot.end_minute)}`;

const marksOn = async (client: PoolClient, slotIds: number[]) => {
  if (slotIds.length === 0) return new Map<number, number>();
  const { rows } = await client.query<{ slot_id: number; marks: number }>(
    'SELECT slot_id, count(*)::int AS marks FROM class_marks WHERE slot_id = ANY($1::bigint[]) GROUP BY slot_id',
    [slotIds]
  );
  return new Map(rows.map((row) => [row.slot_id, row.marks]));
};

const refuseLostMarks = (removed: SlotRow[], marks: Map<number, number>) => {
  const affected = removed.filter((slot) => (marks.get(slot.id) ?? 0) > 0);
  if (affected.length === 0) return;
  const total = affected.reduce((sum, slot) => sum + (marks.get(slot.id) ?? 0), 0);
  throw new HttpError(
    409,
    'marks_would_be_lost',
    `This would remove ${affected.length === 1 ? 'a class' : `${affected.length} classes`} with ${total} attendance mark${total === 1 ? '' : 's'}. Save the change from a later date to keep your history, or confirm to discard them.`,
    affected.map((slot) => ({ slotId: slot.id, class: describeSlot(slot), marks: marks.get(slot.id) }))
  );
};

const pair = (existing: SlotRow[], incoming: SlotInput[]) => {
  const matched: Array<{ old: SlotRow; next: SlotInput }> = [];
  const oldLeft = new Set(existing);
  const newLeft = new Set(incoming);
  const exactKey = (weekday: number, start: number, end: number) => `${weekday}|${start}|${end}`;
  const byExact = new Map([...oldLeft].map((slot) => [exactKey(slot.weekday, slot.start_minute, slot.end_minute), slot]));
  for (const next of incoming) {
    const old = byExact.get(exactKey(next.weekday, next.start, next.end));
    if (old && oldLeft.has(old)) {
      matched.push({ old, next });
      oldLeft.delete(old);
      newLeft.delete(next);
    }
  }
  const group = <T>(items: Iterable<T>, key: (item: T) => string) => {
    const map = new Map<string, T[]>();
    for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
    return map;
  };
  const oldGroups = group(oldLeft, (slot) => `${slot.weekday}|${slot.subject_id}`);
  const newGroups = group(newLeft, (slot) => `${slot.weekday}|${slot.subjectId}`);
  for (const [key, olds] of oldGroups) {
    const news = newGroups.get(key);
    if (olds.length === 1 && news?.length === 1) {
      matched.push({ old: olds[0]!, next: news[0]! });
      oldLeft.delete(olds[0]!);
      newLeft.delete(news[0]!);
    }
  }
  return { matched, removed: [...oldLeft], added: [...newLeft] };
};

const insertSlots = async (client: PoolClient, timetableId: number, versionId: number, slots: SlotInput[]) => {
  if (slots.length === 0) return;
  await client.query(
    `INSERT INTO grid_slots (timetable_id, version_id, subject_id, weekday, start_minute, end_minute, periods)
     SELECT $1, $2, s.subject_id, s.weekday, s.start_minute, s.end_minute, s.periods
       FROM unnest($3::bigint[], $4::smallint[], $5::smallint[], $6::smallint[], $7::smallint[])
         AS s(subject_id, weekday, start_minute, end_minute, periods)`,
    [
      timetableId,
      versionId,
      slots.map((slot) => slot.subjectId),
      slots.map((slot) => slot.weekday),
      slots.map((slot) => slot.start),
      slots.map((slot) => slot.end),
      slots.map((slot) => slot.periods),
    ]
  );
};

export const putGrid = (userId: number, timetableId: number, input: PutGrid) =>
  withTransaction(async (client) => {
    const timetable = await lockTimetable(client, userId, timetableId);
    if (input.effectiveFrom < timetable.starts_on || (timetable.ends_on !== null && input.effectiveFrom > timetable.ends_on)) {
      throw new HttpError(400, 'validation_error', 'effectiveFrom must be within the timetable’s dates');
    }
    await checkSubjects(client, timetableId, input.slots);
    await client.query('SET CONSTRAINTS grid_slots_no_overlap DEFERRED');

    const { rows: versions } = await client.query<{ id: number }>(
      'SELECT id FROM grid_versions WHERE timetable_id = $1 AND effective_from = $2',
      [timetableId, input.effectiveFrom]
    );
    let versionId = versions[0]?.id;
    const summary = { created: false, kept: 0, changed: 0, added: 0, removed: 0, discardedMarks: 0 };

    if (versionId === undefined) {
      const { rows } = await client.query<{ id: number }>(
        'INSERT INTO grid_versions (timetable_id, effective_from) VALUES ($1, $2) RETURNING id',
        [timetableId, input.effectiveFrom]
      );
      versionId = rows[0]!.id;
      await insertSlots(client, timetableId, versionId, input.slots);
      summary.created = true;
      summary.added = input.slots.length;
    } else {
      const { rows: existing } = await client.query<SlotRow>(SLOTS_SQL, [versionId]);
      const { matched, removed, added } = pair(existing, input.slots);
      const marks = await marksOn(client, removed.map((slot) => slot.id));
      if (!input.discardMarks) refuseLostMarks(removed, marks);

      if (removed.length > 0) {
        const ids = removed.map((slot) => slot.id);
        const { rowCount } = await client.query('DELETE FROM class_marks WHERE slot_id = ANY($1::bigint[])', [ids]);
        summary.discardedMarks = rowCount ?? 0;
        await client.query('DELETE FROM grid_slots WHERE id = ANY($1::bigint[])', [ids]);
      }
      for (const { old, next } of matched) {
        const same =
          old.weekday === next.weekday && old.start_minute === next.start && old.end_minute === next.end && old.periods === next.periods && old.subject_id === next.subjectId;
        if (same) {
          summary.kept += 1;
          continue;
        }
        await client.query(
          'UPDATE grid_slots SET weekday = $2, start_minute = $3, end_minute = $4, periods = $5, subject_id = $6 WHERE id = $1',
          [old.id, next.weekday, next.start, next.end, next.periods, next.subjectId]
        );
        summary.changed += 1;
      }
      await insertSlots(client, timetableId, versionId, added);
      summary.added = added.length;
      summary.removed = removed.length;
    }

    const { rows: all } = await client.query<VersionRow>(VERSIONS_SQL, [timetableId]);
    const version = all.find((row) => row.id === versionId)!;
    const { rows: slots } = await client.query<SlotRow>(SLOTS_SQL, [versionId]);
    return { version: toVersion(version), slots: slots.map(toSlot), summary };
  });

export const deleteVersion = (userId: number, timetableId: number, versionId: number, discardMarks: boolean) =>
  withTransaction(async (client) => {
    await lockTimetable(client, userId, timetableId);
    const { rows: found } = await client.query('SELECT id FROM grid_versions WHERE id = $1 AND timetable_id = $2', [versionId, timetableId]);
    if (found.length === 0) throw new HttpError(404, 'not_found', 'Grid version not found');
    const { rows: slots } = await client.query<SlotRow>(SLOTS_SQL, [versionId]);
    const marks = await marksOn(client, slots.map((slot) => slot.id));
    if (!discardMarks) refuseLostMarks(slots, marks);
    await client.query('DELETE FROM class_marks WHERE slot_id = ANY($1::bigint[])', [slots.map((slot) => slot.id)]);
    await client.query('DELETE FROM grid_versions WHERE id = $1', [versionId]);
  });
