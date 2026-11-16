// Daily calories (bars), the 7-day rolling average (solid line) and the goal (dashed step
// line). All three are kcal, so they share one y-axis.
// The data comes straight from GET /api/summary/trends: every number was computed in SQL.
import { useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDate } from '../../utils/dates';
import { chartTheme } from './chartTheme';
import ChartTooltip from './ChartTooltip';

const shortDate = (iso) => formatDate(iso, { month: 'short', day: 'numeric' });

export default function CalorieTrendChart({ days }) {
  // A table view of the same numbers: readable without hovering, and by screen readers.
  const [showTable, setShowTable] = useState(false);

  return (
    <figure className="chart">
      <div className="chart__header">
        <figcaption>Calories, last {days.length} days</figcaption>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => setShowTable((s) => !s)}
        >
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {showTable ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Eaten</th>
                <th>7-day avg</th>
                <th>Goal</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.date}>
                  <td>{shortDate(d.date)}</td>
                  <td>{d.calories ?? '—'}</td>
                  <td>{d.rollingAvg7 ?? '—'}</td>
                  <td>{d.goal ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={chartTheme.grid} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              stroke={chartTheme.axis}
              tick={{ fill: chartTheme.tick, fontSize: 12 }}
              minTickGap={24}
            />
            <YAxis
              stroke={chartTheme.axis}
              tick={{ fill: chartTheme.tick, fontSize: 12 }}
              width={48}
            />
            <Tooltip
              content={<ChartTooltip formatLabel={shortDate} unit="kcal" />}
              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: chartTheme.tick }} />
            <Bar
              dataKey="calories"
              name="Eaten"
              fill={chartTheme.series1}
              radius={[4, 4, 0, 0]}
              maxBarSize={18}
            />
            <Line
              dataKey="rollingAvg7"
              name="7-day average"
              stroke={chartTheme.series2}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              dataKey="goal"
              name="Goal"
              type="stepAfter"
              stroke={chartTheme.reference}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </figure>
  );
}
