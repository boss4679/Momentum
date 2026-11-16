// Recharts calls this with the hovered x position's data. It lists every series at that
// point, value first and name second, each keyed by a short line in the series colour.
// Series with no value (no food logged that day) say so instead of being skipped.
export default function ChartTooltip({ active, payload, label, formatLabel, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__label">{formatLabel ? formatLabel(label) : label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="chart-tooltip__row">
          <span className="chart-tooltip__key" style={{ background: item.color }} />
          <strong>
            {item.value == null ? '—' : `${Math.round(item.value).toLocaleString()} ${unit}`}
          </strong>
          <span className="muted">{item.name}</span>
        </p>
      ))}
    </div>
  );
}
