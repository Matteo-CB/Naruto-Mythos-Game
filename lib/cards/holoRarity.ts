import type { Rarity } from '@/lib/engine/types';

export type HoloRarity = 'common' | 'rare' | 'secret' | 'mythos' | 'legendary' | 'special';

export function holoRarity(rarity: Rarity): HoloRarity {
  if (rarity === 'C' || rarity === 'UC') return 'common';
  if (rarity === 'R' || rarity === 'RA' || rarity === 'MMS') return 'rare';
  if (rarity === 'S' || rarity === 'SV') return 'secret';
  if (rarity === 'M' || rarity === 'MV') return 'mythos';
  if (rarity === 'L') return 'legendary';
  return 'special';
}
