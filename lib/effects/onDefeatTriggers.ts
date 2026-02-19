import type { GameState, PlayerID, CharacterInPlay } from '../engine/types';
import { logAction } from '../engine/utils/gameLog';

/**
 * Trigger on-defeat continuous effects.
 *
 * Scans all face-visible characters for:
 * - Tsunade 003: When a friendly character is defeated, gain 2 chakra
 * - Sasuke 136: When any character is defeated, gain 1 chakra
 *
 * Extracted into its own module to avoid circular dependency between
 * EffectEngine and defeatUtils.
 */
export function triggerOnDefeatEffects(
  state: GameState,
  defeatedChar: CharacterInPlay,
  defeatedCharOwner: PlayerID,
): GameState {
  let newState = state;

  for (const mission of newState.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const controllingPlayer: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';

      for (const char of mission[side]) {
        if (char.isHidden) continue;
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;

        // Tsunade 003: When any friendly character is defeated, gain 2 Chakra
        if (topCard.number === 3 && controllingPlayer === defeatedCharOwner) {
          const hasEffect = topCard.effects.some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]'),
          );
          if (hasEffect) {
            const ps = { ...newState[controllingPlayer] };
            ps.chakra += 2;
            newState = {
              ...newState,
              [controllingPlayer]: ps,
              log: logAction(
                newState.log,
                newState.turn,
                newState.phase,
                controllingPlayer,
                'EFFECT_ON_DEFEAT',
                `Tsunade (003): Gained 2 chakra (friendly character ${defeatedChar.card.name_fr} was defeated).`,
                'game.log.effect.onDefeatChakra',
                { card: 'Tsunade', id: '003/130', amount: 2, defeated: defeatedChar.card.name_fr },
              ),
            };
          }
        }

        // Sasuke 136: When ANY character is defeated, gain 1 Chakra
        if (topCard.number === 136) {
          const hasEffect = topCard.effects.some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]'),
          );
          if (hasEffect) {
            const ps = { ...newState[controllingPlayer] };
            ps.chakra += 1;
            newState = {
              ...newState,
              [controllingPlayer]: ps,
              log: logAction(
                newState.log,
                newState.turn,
                newState.phase,
                controllingPlayer,
                'EFFECT_ON_DEFEAT',
                `Sasuke Uchiwa (136): Gained 1 chakra (character ${defeatedChar.card.name_fr} was defeated).`,
                'game.log.effect.onDefeatChakra',
                { card: 'Sasuke Uchiwa', id: '136/130', amount: 1, defeated: defeatedChar.card.name_fr },
              ),
            };
          }
        }
      }
    }
  }

  return newState;
}
