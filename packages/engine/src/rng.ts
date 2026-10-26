/** Deterministic PRNG (mulberry32). The state lives in GameState so games replay exactly. */
export function nextRandom(state: number): [value: number, nextState: number] {
  const s = (state + 0x6d2b79f5) | 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

/** Fisher–Yates shuffle in place; returns the new RNG state. */
export function shuffleInPlace<T>(items: T[], rngState: number): number {
  let state = rngState;
  for (let i = items.length - 1; i > 0; i--) {
    const [r, next] = nextRandom(state);
    state = next;
    const j = Math.floor(r * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return state;
}
