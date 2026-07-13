// Shared UI primitives: Modal, Field, toast system, empty state, and small
// formatting helpers reused across the three feature modules.
import React, { createContext, useContext, useState, useCallback } from 'react';

// ---- Toasts -----------------------------------------------------------------
const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = `${message}-${toasts.length}-${Math.round(performance.now())}`;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, [toasts.length]);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type === 'error' ? 'error' : ''}`}>{t.message}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---- Modal ------------------------------------------------------------------
export function Modal({ title, children, onClose, footer }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---- Field ------------------------------------------------------------------
// Renders a labeled input and, if present, the server's validation message for
// that field (keyed by name in the `errors` object).
export function Field({ label, name, errors = {}, children }) {
  const err = errors[name];
  return (
    <div className={`field ${err ? 'invalid' : ''}`}>
      {label && <label htmlFor={name}>{label}</label>}
      {children}
      {err && <div className="err">{err}</div>}
    </div>
  );
}

export function EmptyState({ icon = '✨', title, hint }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <div style={{ fontWeight: 600, color: 'var(--text-dim)' }}>{title}</div>
      {hint && <div style={{ marginTop: 4, fontSize: 13 }}>{hint}</div>}
    </div>
  );
}

// ---- Formatting helpers -----------------------------------------------------
export const fmtDate = (iso) =>
  new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });

export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const CATEGORY_COLORS = {
  work: '#8fb4ff', fitness: '#ff9f7a', personal: '#c79bff', general: '#9aa7b4',
};
