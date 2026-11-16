// A week of events. The week is in the URL (?week=2026-03-02) so reload and the back
// button keep the user on the same week.
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../api';
import { useApiData } from '../hooks/useApiData';
import Modal from '../components/Modal';
import { ErrorState, LoadingState } from '../components/StatusViews';
import WeekGrid from '../features/calendar/WeekGrid';
import EventForm from '../features/calendar/EventForm';
import { addDays, formatDate, localMidnight, startOfWeek, today } from '../utils/dates';

export default function CalendarPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const weekStart = startOfWeek(searchParams.get('week') ?? today());
  const goToWeek = (date) => setSearchParams({ week: startOfWeek(date) });

  // null = closed; { event } where event has no id = creating; with an id = editing.
  const [dialog, setDialog] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  // The API's from/to are instants; the week runs from local Monday midnight to the next.
  const events = useApiData(
    () =>
      api.events.list({
        from: localMidnight(weekStart).toISOString(),
        to: localMidnight(addDays(weekStart, 7)).toISOString(),
        limit: 100,
      }),
    [weekStart],
  );

  function openNew(date, hour) {
    const start = localMidnight(date);
    start.setHours(hour);
    const end = new Date(start);
    end.setHours(hour + 1);
    setDeleteError(null);
    setDialog({ event: { startsAt: start.toISOString(), endsAt: end.toISOString() } });
  }

  async function save(body, { allowOverlap }) {
    const { event } = dialog;
    if (event.id) await api.events.update(event.id, body, { allowOverlap });
    else await api.events.create(body, { allowOverlap });
    setDialog(null);
    events.reload();
  }

  async function remove() {
    if (!window.confirm('Delete this event?')) return;
    try {
      await api.events.remove(dialog.event.id);
      setDialog(null);
      events.reload();
    } catch (error) {
      setDeleteError(error);
    }
  }

  const weekEnd = addDays(weekStart, 6);
  const count = events.data?.data.length ?? 0;

  return (
    <div className="page">
      <div className="page__toolbar">
        <h1 className="page__title">
          {formatDate(weekStart, { month: 'short', day: 'numeric' })} –{' '}
          {formatDate(weekEnd, { month: 'short', day: 'numeric', year: 'numeric' })}
        </h1>
        <div className="button-group">
          <button type="button" className="btn" onClick={() => goToWeek(addDays(weekStart, -7))}>
            ← Previous
          </button>
          <button type="button" className="btn" onClick={() => goToWeek(today())}>
            This week
          </button>
          <button type="button" className="btn" onClick={() => goToWeek(addDays(weekStart, 7))}>
            Next →
          </button>
          <button type="button" className="btn btn--primary" onClick={() => openNew(today(), 9)}>
            + New event
          </button>
        </div>
      </div>

      {/* After the first load, a reload keeps showing the old grid instead of a spinner. */}
      {events.status === 'loading' && !events.data && <LoadingState label="Loading events" />}
      {events.status === 'error' && <ErrorState error={events.error} onRetry={events.reload} />}
      {events.data && (
        <>
          <p className="muted">
            {count === 0
              ? 'Nothing scheduled this week. Click any time slot to add an event.'
              : `${count} ${count === 1 ? 'event' : 'events'} this week. Click a time slot to add one.`}
          </p>
          <WeekGrid
            weekStart={weekStart}
            events={events.data.data}
            onSlotClick={openNew}
            onEventClick={(event) => {
              setDeleteError(null);
              setDialog({ event });
            }}
          />
        </>
      )}

      {dialog && (
        <Modal title={dialog.event.id ? 'Edit event' : 'New event'} onClose={() => setDialog(null)}>
          {deleteError && <ErrorState error={deleteError} />}
          <EventForm
            event={dialog.event}
            onSave={save}
            onDelete={dialog.event.id ? remove : undefined}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}
    </div>
  );
}
