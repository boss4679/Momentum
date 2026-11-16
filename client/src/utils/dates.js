// Date helpers for the browser.
//
// Two kinds of value move between the UI and the API:
// - calendar dates ('2026-03-02') for workouts and meals: no time, no timezone
// - instants ('2026-03-02T17:00:00.000Z') for calendar events: an absolute moment
// Calendar-date arithmetic goes through UTC so a daylight-saving change can never turn
// "add one day" into 23 or 25 hours. Instants are shown in the browser's local time.

const pad = (n) => String(n).padStart(2, '0');

// A JS Date -> its local calendar date as 'YYYY-MM-DD'. (toISOString() would give the UTC
// date, which is already tomorrow on a US evening.)
export function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function today() {
  return toISODate(new Date());
}

export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Monday of the week containing isoDate. getUTCDay() is 0 for Sunday, so Sunday is 6 days
// after its Monday.
export function startOfWeek(isoDate) {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return addDays(isoDate, -((day + 6) % 7));
}

// Local midnight at the start of isoDate, as a Date.
export function localMidnight(isoDate) {
  return new Date(`${isoDate}T00:00:00`);
}

// <input type="datetime-local"> works in local wall-clock time with no timezone
// ('2026-03-02T09:00'). These convert between that and the API's instants.
export function toDateTimeInput(instant) {
  const d = new Date(instant);
  return `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeInput(value) {
  // new Date('2026-03-02T09:00') is parsed as LOCAL time; toISOString() gives the instant.
  return new Date(value).toISOString();
}

// Display formats, in the user's locale.
export function formatDate(
  isoDate,
  options = { weekday: 'short', month: 'short', day: 'numeric' },
) {
  return localMidnight(isoDate).toLocaleDateString(undefined, options);
}

export function formatTime(instant) {
  return new Date(instant).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
