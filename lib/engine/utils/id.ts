



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

export function getIdCounter(): number {
  return _counter;
}

export function setIdCounter(value: number): void {
  _counter = value;
}
