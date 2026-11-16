// Weekly training volume (kg lifted = sum of reps x weight). It's a different unit from
// calories, so it gets its own chart instead of a second y-axis. One series, so no legend:
// the title names it.
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate } from '../../utils/dates';
import { chartTheme } from './chartTheme';
import ChartTooltip from './ChartTooltip';

const weekLabel = (iso) => `Wk of ${formatDate(iso, { month: 'short', day: 'numeric' })}`;

export default function WeeklyVolumeChart({ weeks }) {
  return (
    <figure className="chart">
      <div className="chart__header">
        <figcaption>Training volume per week (kg)</figcaption>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={chartTheme.grid} vertical={false} />
          <XAxis
            dataKey="weekStart"
            tickFormatter={(iso) => formatDate(iso, { month: 'short', day: 'numeric' })}
            stroke={chartTheme.axis}
            tick={{ fill: chartTheme.tick, fontSize: 12 }}
          />
          <YAxis
            stroke={chartTheme.axis}
            tick={{ fill: chartTheme.tick, fontSize: 12 }}
            width={56}
          />
          <Tooltip
            content={<ChartTooltip formatLabel={weekLabel} unit="kg" />}
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
          />
          <Bar
            dataKey="volumeKg"
            name="Volume"
            fill={chartTheme.series1}
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
