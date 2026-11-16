// The three non-content states every data view needs. Using the same components everywhere
// keeps loading, error and empty states consistent across pages.

export function LoadingState({ label = 'Loading' }) {
  // role="status" makes screen readers announce it; the visible text doubles as the label.
  return (
    <div className="status-view" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}…
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="status-view status-view--error" role="alert">
      <p>{error?.message ?? 'Something went wrong.'}</p>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, children }) {
  return (
    <div className="status-view status-view--empty">
      <p className="status-view__title">{title}</p>
      {hint && <p className="muted">{hint}</p>}
      {children}
    </div>
  );
}
