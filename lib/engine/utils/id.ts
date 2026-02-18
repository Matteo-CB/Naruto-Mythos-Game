// Simple unique ID generator for game instances
let _counter = 0;

export function generateInstanceId(): string {
  _counter++;
  return `inst_${Date.now()}_${_counter}_${Math.random().toString(36).substring(2, 8)}`;
}

export function generateGameId(): string {
  return `game_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

export function resetIdCounter(): void {
  _counter = 0;
}
