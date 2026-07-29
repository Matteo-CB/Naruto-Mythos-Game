



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

const INSTANCE_ID_PATTERN = /^inst_(\d+)$/;
const SKIPPED_KEYS = new Set(['card', 'effects', 'log', 'actionHistory', 'deck', 'hand', 'discardPile']);

function highestInstanceNumber(value: unknown, depth: number): number {
  if (value == null || depth > 10) return 0;
  if (typeof value === 'string') {
    const match = INSTANCE_ID_PATTERN.exec(value);
    return match ? Number(match[1]) : 0;
  }
  if (Array.isArray(value)) {
    let max = 0;
    for (const entry of value) {
      const found = highestInstanceNumber(entry, depth + 1);
      if (found > max) max = found;
    }
    return max;
  }
  if (typeof value === 'object') {
    let max = 0;
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SKIPPED_KEYS.has(key)) continue;
      const found = highestInstanceNumber(entry, depth + 1);
      if (found > max) max = found;
    }
    return max;
  }
  return 0;
}

export interface InstanceIdSeedSource {
  activeMissions?: unknown;
  pendingEffects?: unknown;
  pendingActions?: unknown;
  instanceSeq?: number;
}

export function seedIdCounterFromState(state: InstanceIdSeedSource | null | undefined): void {
  if (!state) return;
  const highestInPlay = Math.max(
    highestInstanceNumber(state.activeMissions, 0),
    highestInstanceNumber(state.pendingEffects, 0),
    highestInstanceNumber(state.pendingActions, 0),
  );
  const previousHighWaterMark = typeof state.instanceSeq === 'number' ? state.instanceSeq : 0;
  _counter = Math.max(highestInPlay, previousHighWaterMark);
}
