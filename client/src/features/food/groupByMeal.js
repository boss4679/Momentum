// Food entries -> one group per meal, always in breakfast/lunch/dinner/snack order and
// always all four, so an empty meal still shows its heading and an "add" prompt.
export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];

export function groupByMeal(entries) {
  return MEALS.map((meal) => {
    const mealEntries = entries.filter((entry) => entry.meal === meal);
    return {
      meal,
      entries: mealEntries,
      calories: mealEntries.reduce((sum, entry) => sum + entry.calories, 0),
    };
  });
}
