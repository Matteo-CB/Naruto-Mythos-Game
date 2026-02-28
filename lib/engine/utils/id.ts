// Deterministic unique ID generator for game instances.
// Uses a simple counter so replaying the same action sequence from the same
// initial state produces identical instance IDs, which is critical for the
// visual replay system.
let _counter = 0;

export function generateInstanceId(): string {
  _counter++;
  return `inst_${_counter}`;
}

export function generateGameId(): string {
  return `game_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

export function resetIdCounter(): void {
  _counter = 0;
}
