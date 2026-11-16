// Every new account starts with this catalog, so a first-time user can log a workout right
// away. They're ordinary rows owned by the user, who can rename or delete them.
module.exports = [
  { name: 'Bench Press', category: 'strength' },
  { name: 'Back Squat', category: 'strength' },
  { name: 'Deadlift', category: 'strength' },
  { name: 'Overhead Press', category: 'strength' },
  { name: 'Barbell Row', category: 'strength' },
  { name: 'Pull-up', category: 'strength' },
  { name: 'Running', category: 'cardio' },
  { name: 'Cycling', category: 'cardio' },
  { name: 'Rowing', category: 'cardio' },
  { name: 'Plank', category: 'mobility' },
];
