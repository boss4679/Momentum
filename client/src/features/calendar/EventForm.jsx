// Create or edit a calendar event.
//
// The server refuses an event that overlaps another one with 409 EVENT_OVERLAP, listing
// the clashing events. That isn't really an error, just a question, so the form shows
// the clashes and a "Save anyway" button, which resends with ?allowOverlap=true.
import { useState } from 'react';
import { Field, FormError } from '../../components/Field';
import { useFormSubmit } from '../../hooks/useFormSubmit';
import { formatTime, fromDateTimeInput, toDateTimeInput } from '../../utils/dates';

export const CATEGORIES = ['work', 'personal', 'fitness', 'social', 'other'];

export default function EventForm({ event, onSave, onDelete, onCancel }) {
  const [form, setForm] = useState({
    title: event.title ?? '',
    startsAt: toDateTimeInput(event.startsAt),
    endsAt: toDateTimeInput(event.endsAt),
    category: event.category ?? '',
    notes: event.notes ?? '',
  });
  const { submit, submitting, fieldErrors, formError } = useFormSubmit(onSave);
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  function body() {
    return {
      title: form.title,
      // An empty datetime input can't become an instant; send '' so the server says what's wrong.
      startsAt: form.startsAt ? fromDateTimeInput(form.startsAt) : '',
      endsAt: form.endsAt ? fromDateTimeInput(form.endsAt) : '',
      category: form.category || null,
      notes: form.notes.trim() === '' ? null : form.notes,
    };
  }

  function handleSubmit(e) {
    e.preventDefault();
    submit(body(), { allowOverlap: false });
  }

  const overlap = formError?.code === 'EVENT_OVERLAP';

  return (
    <form onSubmit={handleSubmit} noValidate className="stack">
      {overlap ? (
        <FormError error={{ message: 'This time clashes with another event.' }}>
          <ul className="plain-list">
            {formError.details.map((clash) => (
              <li key={clash.eventId}>
                <strong>{clash.message}</strong>{' '}
                <span className="muted">
                  {formatTime(clash.startsAt)} – {formatTime(clash.endsAt)}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn"
            disabled={submitting}
            onClick={() => submit(body(), { allowOverlap: true })}
          >
            Save anyway
          </button>
        </FormError>
      ) : (
        <FormError error={formError} />
      )}

      <Field label="Title" id="title" error={fieldErrors.title}>
        <input id="title" value={form.title} onChange={set('title')} />
      </Field>
      <div className="form-row">
        {/* The overlap "error" is attached to startsAt; it's shown in the banner instead. */}
        <Field label="Starts" id="startsAt" error={overlap ? undefined : fieldErrors.startsAt}>
          <input
            id="startsAt"
            type="datetime-local"
            value={form.startsAt}
            onChange={set('startsAt')}
          />
        </Field>
        <Field label="Ends" id="endsAt" error={fieldErrors.endsAt}>
          <input id="endsAt" type="datetime-local" value={form.endsAt} onChange={set('endsAt')} />
        </Field>
      </div>
      <Field label="Category (optional)" id="category" error={fieldErrors.category}>
        <select id="category" value={form.category} onChange={set('category')}>
          <option value="">None</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notes (optional)" id="eventNotes" error={fieldErrors.notes}>
        <textarea id="eventNotes" rows={3} value={form.notes} onChange={set('notes')} />
      </Field>

      <div className="form-actions">
        {onDelete && (
          <button
            type="button"
            className="btn btn--ghost text-danger form-actions__left"
            onClick={onDelete}
          >
            Delete
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
