import type { GameState, PlayerID, CharacterCard } from '@/lib/engine/types';
import { checkFlexibleUpgrade } from '@/lib/engine/rules/PlayValidation';


export function canAffordAsUpgrade(
  state: GameState,
  player: PlayerID,
  card: { name_fr: string; chakra: number; number?: number; effects?: Array<{ type: string; description: string }> },
  costReduction: number,
): boolean {
  const ps = state[player];
  const friendlySide = player === 'player1' ? 'player1Characters' : 'player2Characters';

  for (const mission of state.activeMissions) {
    for (const char of mission[friendlySide]) {
      if (char.isHidden) continue;
      if (char.controlledBy !== player) continue;

      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      if (card.chakra <= (topCard.chakra ?? 0)) continue;

      
      const isSameName = topCard.name_fr.toUpperCase() === card.name_fr.toUpperCase();
      
      const isFlexible = !isSameName && checkFlexibleUpgrade(card as CharacterCard, topCard);

      if (isSameName || isFlexible) {
        const upgradeCost = Math.max(0, card.chakra - (topCard.chakra ?? 0) - costReduction);
        if (ps.chakra >= upgradeCost) {
          return true;
        }
      }
    }
  }

  return false;
}
