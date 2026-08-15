import type { CardData, GameState, PlayerID } from '@/lib/engine/types';

export interface CarteApercue {
  index: number;
  id?: string;
  name_fr: string;
  name_en?: string;
  chakra?: number;
  power?: number;
  image_file?: string;
}

export function apercuDeCartes(
  state: GameState,
  player: PlayerID,
  indices: number[],
): CarteApercue[] {
  const deck = state[player].deck as unknown as CardData[];
  const apercu: CarteApercue[] = [];
  for (const index of indices) {
    const carte = deck[index];
    if (!carte) continue;
    apercu.push({
      index,
      id: carte.id,
      name_fr: carte.name_fr,
      name_en: carte.name_en,
      chakra: carte.chakra,
      power: carte.power,
      image_file: carte.image_file,
    });
  }
  return apercu;
}
