// The week view, built by hand: a column of hour labels, then 7 day columns. Each day
// column is a positioned box, and each event is placed inside it absolutely:
//   top    = start minute × pixels per minute
//   height = duration × pixels per minute
//   left / width from the event's lane, so overlapping events sit side by side.
// All the date maths lives in layoutWeek(); this component only draws.
import { useEffect, useRef } from 'react';
import { layoutWeek } from '../../utils/calendarLayout';
import { formatDate, formatTime, today } from '../../utils/dates';

const HOUR_HEIGHT = 48; // px
const PX_PER_MINUTE = HOUR_HEIGHT / 60;
const MIN_EVENT_HEIGHT = 20; // so a 10-minute event is still clickable
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function hourLabel(hour) {
  return new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric' });
}

export default function WeekGrid({ weekStart, events, onSlotClick, onEventClick }) {
  const days = layoutWeek(events, weekStart);
  const todayDate = today();
  const scrollRef = useRef(null);

  // Open scrolled to 7am rather than midnight. Runs once, so it doesn't fight the user.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
  }, []);

  // Clicking empty space opens "new event" at that hour.
  function handleColumnClick(date, e) {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    onSlotClick(date, Math.max(0, Math.min(23, Math.floor(y / HOUR_HEIGHT))));
  }

  return (
    <div className="week">
      <div className="week__header">
        <div className="week__gutter" />
        {days.map(({ date }) => (
          <div key={date} className={`week__day-label${date === todayDate ? ' is-today' : ''}`}>
            {formatDate(date)}
          </div>
        ))}
      </div>

      <div className="week__body" ref={scrollRef}>
        <div className="week__gutter">
          {HOURS.map((h) => (
            <div key={h} className="week__hour-label" style={{ height: HOUR_HEIGHT }}>
              {h > 0 && hourLabel(h)}
            </div>
          ))}
        </div>

        {days.map(({ date, segments }) => (
          <div
            key={date}
            className={`week__column${date === todayDate ? ' is-today' : ''}`}
            style={{ height: 24 * HOUR_HEIGHT, backgroundSize: `100% ${HOUR_HEIGHT}px` }}
            onClick={(e) => handleColumnClick(date, e)}
            data-testid={`day-${date}`}
          >
            {segments.map((seg) => (
              <button
                type="button"
                key={seg.event.id}
                className={`event event--${seg.event.category ?? 'none'}`}
                style={{
                  top: seg.startMinute * PX_PER_MINUTE,
                  height: Math.max(
                    (seg.endMinute - seg.startMinute) * PX_PER_MINUTE,
                    MIN_EVENT_HEIGHT,
                  ),
                  left: `${(seg.lane / seg.laneCount) * 100}%`,
                  width: `${100 / seg.laneCount}%`,
                }}
                onClick={(e) => {
                  e.stopPropagation(); // don't also trigger the column's "new event"
                  onEventClick(seg.event);
                }}
              >
                <span className="event__title">{seg.event.title}</span>
                <span className="event__time">
                  {seg.continuesFromPreviousDay ? '…' : formatTime(seg.event.startsAt)}
                  {' – '}
                  {seg.continuesToNextDay ? '…' : formatTime(seg.event.endsAt)}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
