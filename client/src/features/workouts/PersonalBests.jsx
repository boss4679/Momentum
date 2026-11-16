// One row per exercise the user has done, straight from GET /api/workouts/personal-bests
// (computed in SQL with DISTINCT ON).
import { formatDate } from '../../utils/dates';

export default function PersonalBests({ bests }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Exercise</th>
            <th>Heaviest set</th>
            <th>Most reps</th>
            <th>Longest</th>
            <th>Sets logged</th>
            <th>Last done</th>
          </tr>
        </thead>
        <tbody>
          {bests.map((pb) => (
            <tr key={pb.exerciseId}>
              <td>{pb.exerciseName}</td>
              <td>
                {pb.maxWeightKg == null ? (
                  '—'
                ) : (
                  <>
                    {pb.maxWeightKg} kg × {pb.repsAtMaxWeight}
                    <span className="muted">
                      {' '}
                      ({formatDate(pb.maxWeightOn, { month: 'short', day: 'numeric' })})
                    </span>
                  </>
                )}
              </td>
              <td>{pb.maxReps ?? '—'}</td>
              <td>
                {pb.maxDurationSec == null ? '—' : `${Math.round(pb.maxDurationSec / 60)} min`}
              </td>
              <td>{pb.setCount}</td>
              <td>{formatDate(pb.lastPerformedOn, { month: 'short', day: 'numeric' })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
