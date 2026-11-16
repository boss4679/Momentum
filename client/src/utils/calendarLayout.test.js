import { describe, expect, test } from 'vitest';
import { layoutWeek } from './calendarLayout';

// Tests run in America/New_York (see vite.config.js). Events are built from local
// wall-clock times, the way the user sees them.
function event(id, start, end, extra = {}) {
  return {
    id,
    title: `Event ${id}`,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    ...extra,
  };
}

const MONDAY = '2026-03-02';

describe('layoutWeek', () => {
  test('returns 7 days starting on the given Monday', () => {
    const days = layoutWeek([], MONDAY);
    expect(days.map((d) => d.date)).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
    ]);
    expect(days.every((d) => d.segments.length === 0)).toBe(true);
  });

  test('places an event on its day by minutes from local midnight', () => {
    const days = layoutWeek([event(1, '2026-03-03T09:30', '2026-03-03T11:00')], MONDAY);
    const [segment] = days[1].segments;
    expect(segment).toMatchObject({ startMinute: 570, endMinute: 660, lane: 0, laneCount: 1 });
    expect(days[0].segments).toEqual([]);
  });

  test('splits an overnight event into two pieces', () => {
    const days = layoutWeek([event(1, '2026-03-02T22:00', '2026-03-03T02:00')], MONDAY);
    expect(days[0].segments[0]).toMatchObject({
      startMinute: 22 * 60,
      endMinute: 24 * 60,
      continuesToNextDay: true,
      continuesFromPreviousDay: false,
    });
    expect(days[1].segments[0]).toMatchObject({
      startMinute: 0,
      endMinute: 120,
      continuesFromPreviousDay: true,
      continuesToNextDay: false,
    });
  });

  test('an event ending exactly at midnight stays on its own day', () => {
    const days = layoutWeek([event(1, '2026-03-02T23:00', '2026-03-03T00:00')], MONDAY);
    expect(days[0].segments[0]).toMatchObject({ endMinute: 24 * 60, continuesToNextDay: false });
    expect(days[1].segments).toEqual([]);
  });

  test('puts overlapping events in separate lanes and reuses a lane once it is free', () => {
    const days = layoutWeek(
      [
        event(1, '2026-03-04T09:00', '2026-03-04T10:00'),
        event(2, '2026-03-04T09:30', '2026-03-04T10:30'),
        event(3, '2026-03-04T10:00', '2026-03-04T11:00'), // starts when 1 ends: lane 0 again
      ],
      MONDAY,
    );
    const lanes = Object.fromEntries(days[2].segments.map((s) => [s.event.id, s.lane]));
    expect(lanes).toEqual({ 1: 0, 2: 1, 3: 0 });
    expect(days[2].segments.every((s) => s.laneCount === 2)).toBe(true);
  });

  test('ignores events outside the week', () => {
    const days = layoutWeek(
      [
        event(1, '2026-03-01T09:00', '2026-03-01T10:00'), // the Sunday before
        event(2, '2026-03-09T09:00', '2026-03-09T10:00'), // the Monday after
      ],
      MONDAY,
    );
    expect(days.flatMap((d) => d.segments)).toEqual([]);
  });

  test('keeps wall-clock positions across the spring-forward DST change', () => {
    // 2026-03-08 is a 23-hour day in New York: clocks jump from 02:00 to 03:00.
    // An event at 09:00 must still be drawn at the 09:00 line, not an hour off.
    const days = layoutWeek([event(1, '2026-03-08T09:00', '2026-03-08T10:00')], MONDAY);
    expect(days[6].segments[0]).toMatchObject({ startMinute: 540, endMinute: 600 });
  });
});
