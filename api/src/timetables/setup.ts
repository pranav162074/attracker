import type { PoolClient } from 'pg';
import { pool, withTransaction } from '../db/pool.ts';
import { HttpError } from '../http/errors.ts';
import { toTimetable } from './repo.ts';

type Step = { key: 'dates' | 'subjects' | 'grid' | 'holidays'; required: boolean; done: boolean; message: string };

type Facts = {
  starts_on: string;
  ends_on: string | null;
  tracking_started_at: Date | null;
  counting_subjects: number;
  first_version_from: string | null;
  counted_slots_at_start: number;
  calendar_entries: number;
};

const FACTS_SQL = `
  SELECT t.starts_on, t.ends_on, t.tracking_started_at,
         (SELECT count(*)::int FROM subjects s WHERE s.timetable_id = t.id AND s.archived_at IS NULL AND s.counts_attendance) AS counting_subjects,
         (SELECT min(v.effective_from)::text FROM grid_versions v WHERE v.timetable_id = t.id) AS first_version_from,
         (SELECT count(*)::int FROM grid_slots g JOIN subjects s ON s.id = g.subject_id
           WHERE g.version_id = (SELECT v.id FROM grid_versions v WHERE v.timetable_id = t.id AND v.effective_from <= t.starts_on
                                  ORDER BY v.effective_from DESC LIMIT 1)
             AND s.counts_attendance) AS counted_slots_at_start,
         (SELECT count(*)::int FROM calendar_days c WHERE c.timetable_id = t.id) AS calendar_entries
    FROM timetables t
   WHERE t.id = $1 AND t.user_id = $2`;

const checklist = (facts: Facts): Step[] => {
  const steps: Step[] = [
    {
      key: 'dates',
      required: true,
      done: true,
      message: facts.ends_on ? `Runs from ${facts.starts_on} to ${facts.ends_on}` : `Starts on ${facts.starts_on}, no end date`,
    },
    {
      key: 'subjects',
      required: true,
      done: facts.counting_subjects > 0,
      message:
        facts.counting_subjects > 0
          ? `${facts.counting_subjects} subject${facts.counting_subjects === 1 ? '' : 's'} counted for attendance`
          : 'Add at least one subject that counts for attendance',
    },
    {
      key: 'grid',
      required: true,
      done: facts.first_version_from !== null && facts.first_version_from <= facts.starts_on && facts.counted_slots_at_start > 0,
      message:
        facts.first_version_from === null
          ? 'Fill in the weekly timetable'
          : facts.first_version_from > facts.starts_on
            ? `The weekly timetable starts on ${facts.first_version_from}, but the semester starts on ${facts.starts_on}`
            : facts.counted_slots_at_start === 0
              ? 'The weekly timetable has no classes that count for attendance'
              : `${facts.counted_slots_at_start} class${facts.counted_slots_at_start === 1 ? '' : 'es'} a week`,
    },
    {
      key: 'holidays',
      required: false,
      done: facts.calendar_entries > 0,
      message:
        facts.calendar_entries > 0
          ? `${facts.calendar_entries} holiday${facts.calendar_entries === 1 ? '' : 's'} and special day${facts.calendar_entries === 1 ? '' : 's'} added`
          : 'No holidays added yet. Add them now so they are not counted as classes, or later at any time.',
    },
  ];
  return steps;
};

const loadFacts = async (runner: Pick<PoolClient, 'query'>, userId: number, timetableId: number) => {
  const { rows } = await runner.query<Facts>(FACTS_SQL, [timetableId, userId]);
  if (!rows[0]) throw new HttpError(404, 'not_found', 'Timetable not found');
  return rows[0];
};

const summarise = (facts: Facts) => {
  const steps = checklist(facts);
  return {
    status: facts.tracking_started_at === null ? ('setup' as const) : ('tracking' as const),
    ready: steps.every((step) => !step.required || step.done),
    steps,
  };
};

export const getSetup = async (userId: number, timetableId: number) => summarise(await loadFacts(pool, userId, timetableId));

export const startTracking = (userId: number, timetableId: number) =>
  withTransaction(async (client) => {
    const { rows: locked } = await client.query('SELECT id FROM timetables WHERE id = $1 AND user_id = $2 FOR UPDATE', [timetableId, userId]);
    if (locked.length === 0) throw new HttpError(404, 'not_found', 'Timetable not found');
    const setup = summarise(await loadFacts(client, userId, timetableId));
    if (setup.status === 'setup' && !setup.ready) {
      const missing = setup.steps.filter((step) => step.required && !step.done);
      throw new HttpError(409, 'not_ready', missing.map((step) => step.message).join('. '), setup.steps);
    }
    const { rows } = await client.query(
      `UPDATE timetables SET tracking_started_at = coalesce(tracking_started_at, now()), updated_at = now()
        WHERE id = $1 RETURNING id, name, starts_on, ends_on, time_zone, required_bp, condonation_bp, archived_at, tracking_started_at, created_at, updated_at`,
      [timetableId]
    );
    return toTimetable(rows[0]);
  });
