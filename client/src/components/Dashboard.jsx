// Dashboard — the unified landing view aggregating all three modules from the
// server's /api/dashboard summary endpoint.
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { EmptyState, useToast, fmtDate, fmtTime, todayISO, CATEGORY_COLORS } from './ui.jsx';

export default function Dashboard({ onNavigate }) {
  const [data, setData] = useState(null);
  const toast = useToast();

  useEffect(() => {
    api.dashboard(todayISO()).then(setData).catch((e) => toast(e.message, 'error'));
  }, []);

  if (!data) return <div className="loading">Loading your dashboard…</div>;

  const { nutrition, upcomingEvents, recentWorkouts, counts } = data;

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>Today at a glance</h2>
          <p>{fmtDate(todayISO())} · everything in one place.</p>
        </div>
      </div>

      {/* Headline counts */}
      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        <Tile color="var(--nutrition)" label="Calories today" value={nutrition.calories} unit="kcal" />
        <Tile color="var(--calendar)" label="Upcoming events" value={upcomingEvents.length} />
        <Tile color="var(--workout)" label="Workouts logged" value={counts.workouts} />
        <Tile color="#c79bff" label="Foods in catalog" value={counts.foods} />
      </div>

      <div className="grid cols-3">
        {/* Nutrition summary */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>🍎 Nutrition</h2>
            <button className="btn ghost sm" onClick={() => onNavigate('nutrition')}>Open</button>
          </div>
          <p className="sub">{nutrition.entries} item{nutrition.entries !== 1 ? 's' : ''} logged today</p>
          <div style={{ fontSize: 40, fontWeight: 750, letterSpacing: '-0.02em' }}>
            {nutrition.calories}<span className="muted" style={{ fontSize: 16, fontWeight: 500 }}> kcal</span>
          </div>
          <div className="macro-legend" style={{ marginTop: 12 }}>
            <div className="m"><span className="swatch" style={{ background: '#6d8bff' }} />{nutrition.protein}g protein</div>
            <div className="m"><span className="swatch" style={{ background: '#f2b544' }} />{nutrition.carbs}g carbs</div>
            <div className="m"><span className="swatch" style={{ background: '#f2734f' }} />{nutrition.fat}g fat</div>
          </div>
        </div>

        {/* Upcoming events */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>📅 Upcoming</h2>
            <button className="btn ghost sm" onClick={() => onNavigate('calendar')}>Open</button>
          </div>
          <p className="sub">Next {upcomingEvents.length} event{upcomingEvents.length !== 1 ? 's' : ''}</p>
          {upcomingEvents.length === 0 ? (
            <EmptyState icon="🗓️" title="Nothing scheduled" />
          ) : (
            upcomingEvents.map((ev) => (
              <div key={ev.id} className="event-card" style={{ borderLeftColor: CATEGORY_COLORS[ev.category] }}>
                <div className="t">{ev.title}</div>
                <div className="time">{fmtDate(ev.start_time.slice(0, 10))} · {fmtTime(ev.start_time)}</div>
              </div>
            ))
          )}
        </div>

        {/* Recent workouts */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>🏋️ Recent workouts</h2>
            <button className="btn ghost sm" onClick={() => onNavigate('workouts')}>Open</button>
          </div>
          <p className="sub">Last {recentWorkouts.length} session{recentWorkouts.length !== 1 ? 's' : ''}</p>
          {recentWorkouts.length === 0 ? (
            <EmptyState icon="💪" title="No workouts yet" />
          ) : (
            recentWorkouts.map((w) => (
              <div key={w.id} className="row" style={{ padding: '11px 13px' }}>
                <div className="grow">
                  <div className="title" style={{ fontSize: 14 }}>{w.name}</div>
                  <div className="meta">{fmtDate(w.date)}</div>
                </div>
                <span className="pill">{w.exercise_count} ex</span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function Tile({ label, value, unit, color }) {
  return (
    <div className="stat">
      <div className="accent-bar" style={{ background: color }} />
      <div className="label">{label}</div>
      <div className="value">{value}{unit && <span className="unit">{unit}</span>}</div>
    </div>
  );
}
