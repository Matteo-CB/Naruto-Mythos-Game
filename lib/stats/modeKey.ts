export const SEALED_MODE_PREFIX = 'sealed:';

export function unrankedModeKey(room: { isSealed?: boolean; sealedSetChoice?: string | null }): string {
  if (room.isSealed) {
    const set = typeof room.sealedSetChoice === 'string' && room.sealedSetChoice ? room.sealedSetChoice : 'random';
    return `${SEALED_MODE_PREFIX}${set}`;
  }
  return 'casual';
}

export function isSealedModeKey(mode: string): boolean {
  return mode.startsWith(SEALED_MODE_PREFIX);
}

export function sealedSetFromModeKey(mode: string): string {
  return mode.slice(SEALED_MODE_PREFIX.length);
}
