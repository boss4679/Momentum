// Fixed reference data the seed generator picks from.

// startKg is a typical working weight at the start of the seeded period; the generator
// adds slow progress on top so personal bests actually move over time.
const EXERCISES = [
  { name: 'Bench Press', category: 'strength', startKg: 60 },
  { name: 'Overhead Press', category: 'strength', startKg: 37.5 },
  { name: 'Incline Dumbbell Press', category: 'strength', startKg: 22.5 },
  { name: 'Back Squat', category: 'strength', startKg: 80 },
  { name: 'Romanian Deadlift', category: 'strength', startKg: 70 },
  { name: 'Deadlift', category: 'strength', startKg: 100 },
  { name: 'Barbell Row', category: 'strength', startKg: 55 },
  { name: 'Pull-up', category: 'strength', startKg: 0 },
  { name: 'Running', category: 'cardio' },
  { name: 'Cycling', category: 'cardio' },
  { name: 'Plank', category: 'mobility' },
];

// A simple push / pull / legs split plus a cardio day. The generator rotates through these.
const ROUTINES = [
  { notes: 'Push day', exercises: ['Bench Press', 'Overhead Press', 'Incline Dumbbell Press'] },
  { notes: 'Pull day', exercises: ['Deadlift', 'Barbell Row', 'Pull-up'] },
  { notes: 'Leg day', exercises: ['Back Squat', 'Romanian Deadlift', 'Plank'] },
  { notes: 'Cardio', exercises: ['Running'] },
  { notes: 'Easy ride', exercises: ['Cycling'] },
];

// Per-serving nutrition; the generator scales each serving a little so days vary.
const FOODS = {
  breakfast: [
    { name: 'Oatmeal with berries', calories: 350, protein_g: 10, carbs_g: 60, fat_g: 7 },
    { name: 'Greek yogurt and granola', calories: 320, protein_g: 20, carbs_g: 40, fat_g: 8 },
    { name: 'Scrambled eggs on toast', calories: 420, protein_g: 24, carbs_g: 30, fat_g: 22 },
    { name: 'Protein smoothie', calories: 300, protein_g: 30, carbs_g: 35, fat_g: 5 },
  ],
  lunch: [
    { name: 'Chicken burrito bowl', calories: 650, protein_g: 42, carbs_g: 70, fat_g: 20 },
    { name: 'Turkey sandwich', calories: 480, protein_g: 30, carbs_g: 50, fat_g: 15 },
    { name: 'Salmon poke bowl', calories: 600, protein_g: 35, carbs_g: 65, fat_g: 18 },
    { name: 'Lentil soup and bread', calories: 450, protein_g: 20, carbs_g: 65, fat_g: 10 },
  ],
  dinner: [
    { name: 'Steak, rice and broccoli', calories: 750, protein_g: 50, carbs_g: 70, fat_g: 25 },
    { name: 'Spaghetti bolognese', calories: 700, protein_g: 35, carbs_g: 85, fat_g: 22 },
    { name: 'Chicken stir-fry', calories: 600, protein_g: 45, carbs_g: 55, fat_g: 18 },
    { name: 'Tofu curry with rice', calories: 650, protein_g: 25, carbs_g: 80, fat_g: 22 },
    { name: 'Pizza (3 slices)', calories: 850, protein_g: 35, carbs_g: 95, fat_g: 35 },
  ],
  snack: [
    { name: 'Apple', calories: 95, protein_g: 0.5, carbs_g: 25, fat_g: 0.3 },
    { name: 'Protein bar', calories: 220, protein_g: 20, carbs_g: 22, fat_g: 7 },
    { name: 'Almonds (30 g)', calories: 170, protein_g: 6, carbs_g: 6, fat_g: 15 },
    { name: 'Dark chocolate', calories: 160, protein_g: 2, carbs_g: 13, fat_g: 11 },
  ],
};

// Recurring calendar events. Times are local to the demo user's timezone. Slots don't
// overlap within a day, because the API will reject overlaps by default (milestone 3).
const WEEKDAY_EVENTS = [
  { title: 'Team standup', start: '09:30', end: '09:45', category: 'work', probability: 1 },
  { title: 'Deep work block', start: '10:00', end: '12:00', category: 'work', probability: 0.5 },
  { title: '1:1 with manager', start: '14:00', end: '14:30', category: 'work', probability: 0.2 },
  { title: 'Sprint planning', start: '15:00', end: '16:00', category: 'work', probability: 0.15 },
  { title: 'Gym session', start: '18:00', end: '19:15', category: 'fitness', probability: 0.4 },
];

const WEEKEND_EVENTS = [
  { title: 'Long run', start: '08:00', end: '09:30', category: 'fitness', probability: 0.5 },
  { title: 'Groceries', start: '11:00', end: '12:00', category: 'personal', probability: 0.6 },
  {
    title: 'Dinner with friends',
    start: '19:00',
    end: '21:30',
    category: 'social',
    probability: 0.4,
  },
];

module.exports = { EXERCISES, ROUTINES, FOODS, WEEKDAY_EVENTS, WEEKEND_EVENTS };
