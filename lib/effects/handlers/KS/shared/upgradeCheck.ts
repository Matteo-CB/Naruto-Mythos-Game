import type { GameState, PlayerID } from '@/lib/engine/types';

/**
 * Check if a card could be played as an upgrade over an existing same-name
 * character on any mission, considering a cost reduction.
 *
 * Returns true if there exists at least one mission where the player has a
 * visible same-name character with strictly lower chakra, and the upgrade cost
 * (difference minus reduction) is affordable.
 */
export function canAffordAsUpgrade(
  state: GameState,
  player: PlayerID,
  card: { name_fr: string; chakra: number },
  costReduction: number,
): boolean {
  const ps = state[player];
  const friendlySide = player === 'player1' ? 'player1Characters' : 'player2Characters';

  for (const mission of state.activeMissions) {
    for (const char of mission[friendlySide]) {
      if (char.isHidden) continue;
      if (char.controlledBy !== player) continue;

      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.name_fr.toUpperCase() !== card.name_fr.toUpperCase()) continue;
      if (card.chakra <= (topCard.chakra ?? 0)) continue;

      const upgradeCost = Math.max(0, card.chakra - (topCard.chakra ?? 0) - costReduction);
      if (ps.chakra >= upgradeCost) {
        return true;
      }
    }
  }

  return false;
}
