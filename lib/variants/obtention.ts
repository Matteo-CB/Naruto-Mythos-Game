import { BOOSTER_EXCLUDED_VARIANTS } from './constants';

// How a variant card can be obtained. Admin-configurable at runtime (stored in the DB),
// falling back to the code default derived from BOOSTER_EXCLUDED_VARIANTS.
//  - 'booster'  : pullable from variant boosters (the default for most variants).
//  - 'reserved' : excluded from boosters, obtained through tournaments / battlepass / events.
//  - 'locked'   : not obtainable by players at all; admin grant only.
export type ObtentionMode = 'booster' | 'reserved' | 'locked';

const overrides: Record<string, ObtentionMode> = {};

function isValidMode(m: unknown): m is ObtentionMode {
  return m === 'booster' || m === 'reserved' || m === 'locked';
}

export function applyVariantObtentionOverrides(map: Record<string, unknown> | null | undefined): void {
  for (const k of Object.keys(overrides)) delete overrides[k];
  if (map) {
    for (const [cardId, mode] of Object.entries(map)) {
      if (isValidMode(mode)) overrides[cardId] = mode;
    }
  }
}

export function getVariantObtentionOverrides(): Record<string, ObtentionMode> {
  return { ...overrides };
}

export function getVariantObtentionMode(cardId: string): ObtentionMode {
  const o = overrides[cardId];
  if (o) return o;
  return BOOSTER_EXCLUDED_VARIANTS.has(cardId) ? 'reserved' : 'booster';
}

export function isBoosterObtainableVariant(cardId: string): boolean {
  return getVariantObtentionMode(cardId) === 'booster';
}
