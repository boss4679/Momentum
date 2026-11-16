// Calendar dates are handled as 'YYYY-MM-DD' strings, the same shape Postgres DATE values
// come back as. The arithmetic goes through UTC so daylight-saving changes in the local
// timezone can never turn "add 1 day" into 23 or 25 hours.

// Today's date as seen by someone in `timeZone`. The en-CA locale happens to format dates
// as YYYY-MM-DD.
function todayIn(timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// 0 = Sunday ... 6 = Saturday
function dayOfWeek(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

// Whole days from `from` to `to` (both 'YYYY-MM-DD'); negative if `to` is earlier.
function daysBetween(from, to) {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

function isWeekend(isoDate) {
  const day = dayOfWeek(isoDate);
  return day === 0 || day === 6;
}

module.exports = { todayIn, addDays, daysBetween, dayOfWeek, isWeekend };
