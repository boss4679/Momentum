// Chart colours in one place. These are dark-mode steps of a categorical palette that was
// checked for colour-blind separation and for >= 3:1 contrast against the card background
// (#161b22). Series identity never relies on colour alone: there's always a legend, and
// the goal line is also dashed.
export const chartTheme = {
  series1: '#3987e5', // blue: calories eaten / workout volume
  series2: '#d95926', // orange: 7-day rolling average
  reference: '#898781', // muted grey: the goal line
  grid: '#263040',
  axis: '#647184',
  tick: '#9aa7b4',
};
