// Calendar module — upcoming events grouped by day with a create/edit form.
import React, { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api.js';
import { Modal, Field, EmptyState, useToast, fmtTime, CATEGORY_COLORS } from './ui.jsx';

const CATEGORIES = ['general', 'work', 'fitness', 'personal'];

// A sensible default: today at the next round hour, for one hour.
function defaultTimes() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return { start: toLocalInput(start), end: toLocalInput(end) };
}
function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const blankEvent = () => {
  const t = defaultTimes();
  return { title: '', description: '', category: 'general', start_time: t.start, end_time: t.end };
};

export default function Calendar() {
  const [events, setEvents] = useState(null);
  const [editing, setEditing] = useState(null);
  const toast = useToast();

  const load = () => api.listEvents().then(setEvents).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, []);

  const remove = async (ev) => {
    if (!confirm(`Delete "${ev.title}"?`)) return;
    try { await api.deleteEvent(ev.id); toast('Event deleted'); load(); }
    catch (e) { toast(e.message, 'error'); }
  };

  // Group events by calendar day (YYYY-MM-DD).
  const days = useMemo(() => {
    if (!events) return [];
    const map = new Map();
    for (const ev of events) {
      const key = ev.start_time.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  const todayKey = toLocalInput(new Date()).slice(0, 10);

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>Calendar</h2>
          <p>Schedule and track everything from meetings to gym sessions.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing(blankEvent())}>+ New event</button>
      </div>

      {events === null ? (
        <div className="loading">Loading…</div>
      ) : events.length === 0 ? (
        <EmptyState icon="📅" title="Nothing scheduled" hint="Add an event to fill up your calendar." />
      ) : (
        <div className="grid cols-3">
          {days.map(([day, evs]) => (
            <div key={day} className={`card cal-day ${day === todayKey ? 'today' : ''}`}>
              <div className="day-head">
                <span className="dow">{new Date(day + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long' })}</span>
                <span className="date">{new Date(day + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              </div>
              {evs.map((ev) => (
                <div key={ev.id} className="event-card" style={{ borderLeftColor: CATEGORY_COLORS[ev.category] }}>
                  <div className="t">{ev.title}</div>
                  <div className="time">
                    {fmtTime(ev.start_time)}{ev.end_time ? ` – ${fmtTime(ev.end_time)}` : ''} · <span style={{ color: CATEGORY_COLORS[ev.category] }}>{ev.category}</span>
                  </div>
                  {ev.description && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{ev.description}</div>}
                  <div className="row-actions">
                    <button className="btn ghost sm" onClick={() => setEditing(toEditable(ev))}>Edit</button>
                    <button className="btn ghost sm danger" onClick={() => remove(ev)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EventForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </section>
  );
}

function toEditable(ev) {
  return {
    id: ev.id, title: ev.title, description: ev.description || '', category: ev.category,
    start_time: ev.start_time.slice(0, 16), end_time: ev.end_time ? ev.end_time.slice(0, 16) : '',
  };
}

function EventForm({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const isEdit = Boolean(initial.id);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    setErrors({});
    const body = {
      title: form.title, description: form.description || null, category: form.category,
      start_time: form.start_time, end_time: form.end_time || null,
    };
    try {
      if (isEdit) await api.updateEvent(initial.id, body);
      else await api.createEvent(body);
      toast(isEdit ? 'Event updated' : 'Event created');
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.details) { setErrors(e.details); toast('Please fix the highlighted fields', 'error'); }
      else toast(e.message, 'error');
    } finally { setSaving(false); }
  };

  return (
    <Modal
      title={isEdit ? 'Edit event' : 'New event'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save event'}</button>
        </>
      }
    >
      <Field label="Title" name="title" errors={errors}>
        <input id="title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Team standup" />
      </Field>
      <div className="field-row">
        <Field label="Starts" name="start_time" errors={errors}>
          <input id="start_time" type="datetime-local" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} />
        </Field>
        <Field label="Ends (optional)" name="end_time" errors={errors}>
          <input id="end_time" type="datetime-local" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} />
        </Field>
      </div>
      <Field label="Category" name="category" errors={errors}>
        <select id="category" value={form.category} onChange={(e) => set('category', e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
        </select>
      </Field>
      <Field label="Description" name="description" errors={errors}>
        <textarea id="description" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Details…" />
      </Field>
    </Modal>
  );
}
