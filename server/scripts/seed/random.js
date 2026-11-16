// A tiny seeded pseudo-random generator (mulberry32). Math.random() would give different
// data on every run; a fixed seed gives the same demo data every time, so screenshots,
// charts and EXPLAIN timings are reproducible.
function createRandom(seed) {
  let state = seed >>> 0;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // float in [0, 1)
  }

  return {
    next,
    chance: (probability) => next() < probability,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)), // inclusive of both ends
    between: (min, max) => min + next() * (max - min),
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}

module.exports = { createRandom };
