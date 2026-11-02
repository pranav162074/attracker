import { describe, it, expect } from 'vitest';
import type { GridSlot, HistoryEvent } from '../src/lib/api.ts';
import { eventText, eventTone, eventWhen, missedTotal, splitHistory, subjectOutlook, weeklyLoad, weeklySlots } from '../src/lib/subject.ts';

const event = (values: Partial<HistoryEvent>): HistoryEvent => ({
  date: '2026-08-03',
  start: '08:40',
  end: '11:10',
  units: 3,
  kind: 'absent',
  otherSubjectId: null,
  beforeCheckpoint: false,
  ...values,
});

const slot = (values: Partial<GridSlot>): GridSlot => ({ id: 1, weekday: 1, start: '08:40', end: '11:10', periods: 3, subjectId: 5, ...values });

describe('the subject’s history', () => {
  it('describes each kind of event', () => {
    expect(eventText(event({}), null)).toBe('Absent, 3 periods');
    expect(eventText(event({ units: 1, otherSubjectId: 2 }), 'OOAD')).toBe('Absent, in OOAD’s period');
    expect(eventText(event({ kind: 'planned_absent' }), null)).toBe('You plan to miss this, 3 periods');
    expect(eventText(event({ kind: 'cancelled' }), null)).toBe('Cancelled, not counted');
    expect(eventText(event({ kind: 'extra', units: 1 }), null)).toBe('Extra class');
    expect(eventText(event({ kind: 'took_over', units: 1, otherSubjectId: 2 }), 'OOAD')).toBe('Taught in OOAD’s period');
    expect(eventText(event({ kind: 'taken_by_other', otherSubjectId: 9 }), 'Computer Networks')).toBe('Period taken by Computer Networks, not counted here');
    expect(eventText(event({ kind: 'taken_by_other', otherSubjectId: 9 }), null)).toBe('Period taken by another subject, not counted here');
  });

  it('colours what helps and what hurts', () => {
    expect(eventTone(event({}))).toBe('bad');
    expect(eventTone(event({ kind: 'planned_absent' }))).toBe('warn');
    expect(eventTone(event({ kind: 'extra' }))).toBe('good');
    expect(eventTone(event({ kind: 'took_over' }))).toBe('good');
    expect(eventTone(event({ kind: 'cancelled' }))).toBe('neutral');
  });

  it('shows the newest past events first and the coming ones in order', () => {
    const events = [
      event({ date: '2026-08-03' }),
      event({ date: '2026-09-14', kind: 'cancelled' }),
      event({ date: '2026-11-09', kind: 'planned_absent' }),
      event({ date: '2026-11-04', kind: 'planned_absent' }),
      event({ date: '2026-11-20', kind: 'extra' }),
    ];
    const { coming, past } = splitHistory(events, '2026-11-03');
    expect(past.map((item) => item.date)).toEqual(['2026-09-14', '2026-08-03']);
    expect(coming.map((item) => item.date)).toEqual(['2026-11-04', '2026-11-09', '2026-11-20']);
    expect(eventWhen(event({}))).toBe('3 Aug 2026, 8:40 am');
  });

  it('adds up periods missed', () => {
    expect(missedTotal([event({}), event({ units: 1 }), event({ kind: 'planned_absent' }), event({ kind: 'cancelled' })])).toBe(4);
    expect(missedTotal([])).toBe(0);
  });
});

describe('the subject’s week', () => {
  const slots = [slot({}), slot({ id: 2, weekday: 3, start: '14:30', end: '15:20', periods: 1 }), slot({ id: 3, subjectId: 6 })];

  it('lists when it happens', () => {
    expect(weeklySlots(slots, 5)).toEqual(['Mon 8:40 am to 11:10 am, 3 periods', 'Wed 2:30 pm to 3:20 pm']);
    expect(weeklySlots(slots, 7)).toEqual([]);
  });

  it('counts the weekly load in periods or classes', () => {
    expect(weeklyLoad(slots, 5, false)).toBe('4 periods a week, in 2 classes');
    expect(weeklyLoad(slots, 5, true)).toBe('2 classes a week');
    expect(weeklyLoad([slot({ periods: 1 }), slot({ id: 2, periods: 1, weekday: 2 })], 5, false)).toBe('2 classes a week');
    expect(weeklyLoad(slots, 7, false)).toBe('Not in the weekly timetable');
  });

  it('gives the best the subject can still reach', () => {
    expect(subjectOutlook({ remaining: 15, bestText: '81.48', unitsPerClass: 3 })).toBe('15 periods left this term. Attending all of them takes this subject to 81.48%.');
    expect(subjectOutlook({ remaining: 1, bestText: '70.00', unitsPerClass: 1 })).toBe('1 class left this term. Attending all of them takes this subject to 70.00%.');
    expect(subjectOutlook({ remaining: 0, bestText: '60.00', unitsPerClass: 1 })).toBe('No classes of this subject are left this term.');
    expect(subjectOutlook({ remaining: null, bestText: null, unitsPerClass: 1 })).toBeNull();
  });
});
