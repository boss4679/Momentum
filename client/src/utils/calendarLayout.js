// Turns a list of events into what the week grid draws: for each of the 7 days, the event
// pieces to show that day, each with a vertical position (minutes from midnight) and a
// horizontal lane.
//
// This is plain JavaScript with no React, so it can be unit-tested with simple inputs.
import { addDays, localMidnight } from './dates';

const MINUTES_PER_DAY = 24 * 60;

// Minutes since local midnight. Using the clock reading (hours * 60 + minutes) instead of
// subtracting timestamps keeps 09:00 at the 09:00 line, even on a 23- or 25-hour DST day.
function minutesIntoDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// The part of `event` that falls on the day [dayStart, dayEnd), or null if none does.
// An event from 23:00 to 01:00 becomes two pieces: 23:00-24:00 on the first day and
// 00:00-01:00 on the next.
function segmentForDay(event, dayStart, dayEnd) {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  if (end <= dayStart || start >= dayEnd) return null;

  const startsBeforeDay = start < dayStart;
  const endsAfterDay = end > dayEnd;
  return {
    event,
    startMinute: startsBeforeDay ? 0 : minutesIntoDay(start),
    endMinute: endsAfterDay ? MINUTES_PER_DAY : minutesIntoDay(end) || MINUTES_PER_DAY,
    continuesFromPreviousDay: startsBeforeDay,
    continuesToNextDay: endsAfterDay,
  };
}

// Overlapping events sit side by side. Each piece goes in the first "lane" (column) whose
// last piece has already ended; if none is free, a new lane opens. All pieces that day
// then share the width equally between the lanes. A smarter layout would group only
// overlapping events together, but this one is simple and never overlaps two boxes.
function assignLanes(segments) {
  const sorted = [...segments].sort(
    (a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute,
  );
  const laneEnds = [];
  for (const segment of sorted) {
    let lane = laneEnds.findIndex((end) => end <= segment.startMinute);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = segment.endMinute;
    segment.lane = lane;
  }
  for (const segment of sorted) {
    segment.laneCount = laneEnds.length;
  }
  return sorted;
}

// weekStart: the Monday, as 'YYYY-MM-DD'. Returns 7 entries: { date, segments }.
export function layoutWeek(events, weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const dayStart = localMidnight(date);
    const dayEnd = localMidnight(addDays(date, 1));
    const segments = events.map((event) => segmentForDay(event, dayStart, dayEnd)).filter(Boolean);
    return { date, segments: assignLanes(segments) };
  });
}
