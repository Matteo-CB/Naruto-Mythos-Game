import { cardVersionKey } from '@/lib/cards/versionKey';
import { MISSION_CARDS_PER_PLAYER } from '@/lib/engine/types';

export const HIGHLANDER_MIN_DECK_SIZE = 40;
export const HIGHLANDER_MAX_COPIES_PER_VERSION = 1;

export type MotifDeRefusHighlander = 'tooFewCards' | 'duplicateVersion' | 'missionCount';

export interface VerdictHighlander {
  compatible: boolean;
  motifs: MotifDeRefusHighlander[];
  doublons: string[];
  nombreDeCartes: number;
}

export function verifieDeckHighlander(
  cardIds: readonly string[],
  missionIds: readonly string[],
): VerdictHighlander {
  const motifs: MotifDeRefusHighlander[] = [];

  if (cardIds.length < HIGHLANDER_MIN_DECK_SIZE) motifs.push('tooFewCards');
  if (missionIds.length !== MISSION_CARDS_PER_PLAYER) motifs.push('missionCount');

  const comptes = new Map<string, number>();
  for (const id of cardIds) {
    const version = cardVersionKey(id);
    comptes.set(version, (comptes.get(version) ?? 0) + 1);
  }
  const doublons = [...comptes.entries()]
    .filter(([, n]) => n > HIGHLANDER_MAX_COPIES_PER_VERSION)
    .map(([version]) => version)
    .sort();
  if (doublons.length > 0) motifs.push('duplicateVersion');

  return {
    compatible: motifs.length === 0,
    motifs,
    doublons,
    nombreDeCartes: cardIds.length,
  };
}

export function estDeckHighlander(
  cardIds: readonly string[],
  missionIds: readonly string[],
): boolean {
  return verifieDeckHighlander(cardIds, missionIds).compatible;
}
