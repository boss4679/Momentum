const { todayIn, addDays, daysBetween, dayOfWeek, isWeekend } = require('../../src/utils/dates');

describe('date helpers', () => {
  test.each([
    ['2026-03-01', 1, '2026-03-02'],
    ['2026-03-01', -1, '2026-02-28'], // across a month boundary
    ['2028-02-28', 1, '2028-02-29'], // leap year
    ['2026-12-31', 1, '2027-01-01'], // across a year boundary
    // The US switched to daylight saving time on 2026-03-08, so that local day is 23 hours
    // long. The helpers work in UTC, so a day is always a day.
    ['2026-03-07', 2, '2026-03-09'],
  ])('addDays(%s, %i) = %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });

  test('daysBetween counts whole days, negative when going backwards', () => {
    expect(daysBetween('2026-03-01', '2026-03-31')).toBe(30);
    expect(daysBetween('2026-03-31', '2026-03-01')).toBe(-30);
    expect(daysBetween('2026-03-01', '2026-03-01')).toBe(0);
  });

  test('todayIn returns YYYY-MM-DD for the given timezone', () => {
    expect(todayIn('UTC')).toBe(new Date().toISOString().slice(0, 10));
    // Kiritimati (UTC+14) and Niue (UTC-11) are 25 hours apart, so they are always on
    // different calendar days.
    expect(todayIn('Pacific/Kiritimati')).not.toBe(todayIn('Pacific/Niue'));
  });

  test('dayOfWeek and isWeekend', () => {
    expect(dayOfWeek('2026-03-01')).toBe(0); // Sunday
    expect(isWeekend('2026-03-01')).toBe(true);
    expect(isWeekend('2026-03-02')).toBe(false); // Monday
  });
});
