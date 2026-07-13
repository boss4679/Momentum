// Root app shell — top bar, tab navigation, and the active module view.
import React, { useState } from 'react';
import { ToastProvider } from './components/ui.jsx';
import Dashboard from './components/Dashboard.jsx';
import Workouts from './components/Workouts.jsx';
import Calendar from './components/Calendar.jsx';
import Nutrition from './components/Nutrition.jsx';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', dot: 'linear-gradient(135deg, var(--workout), var(--nutrition))' },
  { id: 'workouts', label: 'Workouts', dot: 'var(--workout)' },
  { id: 'calendar', label: 'Calendar', dot: 'var(--calendar)' },
  { id: 'nutrition', label: 'Nutrition', dot: 'var(--nutrition)' },
];

export default function App() {
  const [tab, setTab] = useState('dashboard');

  return (
    <ToastProvider>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">M</div>
            <div>
              <h1>Momentum</h1>
              <p>All-in-one productivity</p>
            </div>
          </div>
          <div className="spacer" />
        </header>

        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              <span className="dot" style={{ background: t.dot }} />
              {t.label}
            </button>
          ))}
        </nav>

        {tab === 'dashboard' && <Dashboard onNavigate={setTab} />}
        {tab === 'workouts' && <Workouts />}
        {tab === 'calendar' && <Calendar />}
        {tab === 'nutrition' && <Nutrition />}
      </div>
    </ToastProvider>
  );
}
