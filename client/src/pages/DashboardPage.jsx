// The dashboard: one GET /api/summary/daily for the cards, and one GET /api/summary/trends
// for the charts. They load independently, so a slow or failed chart doesn't hide the cards.
import { api } from '../api';
import { useApiData } from '../hooks/useApiData';
import { EmptyState, ErrorState, LoadingState } from '../components/StatusViews';
import { formatDate } from '../utils/dates';
import {
  CaloriesCard,
  EventsCard,
  TrendsCard,
  WorkoutsCard,
} from '../features/dashboard/SummaryCards';
import CalorieTrendChart from '../features/dashboard/CalorieTrendChart';
import WeeklyVolumeChart from '../features/dashboard/WeeklyVolumeChart';

export default function DashboardPage() {
  const daily = useApiData(() => api.summary.daily(), []);
  const trends = useApiData(() => api.summary.trends(), []);

  return (
    <div className="page">
      <h1 className="page__title">
        {daily.data
          ? formatDate(daily.data.date, { weekday: 'long', month: 'long', day: 'numeric' })
          : 'Today'}
      </h1>

      {daily.status === 'loading' && <LoadingState label="Loading today's summary" />}
      {daily.status === 'error' && <ErrorState error={daily.error} onRetry={daily.reload} />}
      {daily.status === 'success' && (
        <div className="card-grid">
          <WorkoutsCard workouts={daily.data.workouts} />
          <EventsCard events={daily.data.upcomingEvents} />
          <CaloriesCard calories={daily.data.calories} />
          <TrendsCard trends={daily.data.trends} />
        </div>
      )}

      <section className="card" aria-label="Charts">
        {trends.status === 'loading' && <LoadingState label="Loading trends" />}
        {trends.status === 'error' && <ErrorState error={trends.error} onRetry={trends.reload} />}
        {trends.status === 'success' && <TrendCharts data={trends.data} />}
      </section>
    </div>
  );
}

function TrendCharts({ data }) {
  const hasFood = data.dailyCalories.some((d) => d.calories !== null);
  const hasWorkouts = data.weeklyVolume.some((w) => w.workouts > 0);
  if (!hasFood && !hasWorkouts) {
    return (
      <EmptyState
        title="No trends yet"
        hint="Log some meals and workouts and your 30-day trends will appear here."
      />
    );
  }
  return (
    <div className="charts">
      {hasFood && <CalorieTrendChart days={data.dailyCalories} />}
      {hasWorkouts && <WeeklyVolumeChart weeks={data.weeklyVolume} />}
    </div>
  );
}
