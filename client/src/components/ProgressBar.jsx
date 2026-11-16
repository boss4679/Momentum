// Calories eaten against the daily goal. The bar is capped at 100% wide, but the text and
// colour change when the goal is exceeded, so "over" never relies on colour alone.
export default function ProgressBar({ value, max, label }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  const over = value > max;
  return (
    <div className="progress">
      <div
        className={`progress__track${over ? ' progress__track--over' : ''}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} of ${max} (${percent}%)`}
      >
        <div className="progress__fill" style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <p className="progress__caption">
        <strong>{value.toLocaleString()}</strong> / {max.toLocaleString()} kcal
        <span className={over ? 'text-danger' : 'muted'}>
          {over
            ? ` · ${(value - max).toLocaleString()} over goal`
            : ` · ${(max - value).toLocaleString()} left`}
        </span>
      </p>
    </div>
  );
}
