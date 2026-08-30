import type { CharacterCard, PlayerID } from '../types';
import { calculateEffectiveCost } from './ChakraValidation';

export function coutMinimalPourPoser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any,
  player: PlayerID,
  card: CharacterCard,
): number {
  const imprime = Math.max(0, card.chakra ?? 0);
  const missions = state?.activeMissions;
  if (!Array.isArray(missions) || missions.length === 0) return imprime;

  let minimum = Number.POSITIVE_INFINITY;
  for (let i = 0; i < missions.length; i++) {
    try {
      const cout = calculateEffectiveCost(state, player, card, i, false);
      if (cout < minimum) minimum = cout;
    } catch {
      if (imprime < minimum) minimum = imprime;
    }
  }

  if (!Number.isFinite(minimum)) return imprime;
  return Math.max(0, minimum);
}
