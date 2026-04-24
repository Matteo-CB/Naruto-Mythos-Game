import type { GameState, PlayerID, CharacterInPlay } from '../engine/types';
import { logAction } from '../engine/utils/gameLog';


export function triggerOnDefeatEffects(
  state: GameState,
  defeatedChar: CharacterInPlay,
  defeatedCharOwner: PlayerID,
  simultaneousDefeatIds?: string[],
): GameState {
  let newState = state;

  for (const mission of newState.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const controllingPlayer: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';

      for (const char of mission[side]) {
        if (char.isHidden) continue;
        
        if (simultaneousDefeatIds && simultaneousDefeatIds.includes(char.instanceId)) continue;
        const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;

        
        if (topCard.number === 3 && controllingPlayer === defeatedCharOwner) {
          const hasEffect = (topCard.effects ?? []).some(
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
                { card: 'Tsunade', id: 'KS-003-C', amount: 2, defeated: defeatedChar.card.name_fr },
              ),
            };
          }
        }

        
        if (topCard.number === 136) {
          const hasEffect = (topCard.effects ?? []).some(
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
                { card: 'Sasuke Uchiwa', id: 'KS-136-S', amount: 1, defeated: defeatedChar.card.name_fr },
              ),
            };
          }
        }
      }
    }
  }

  return newState;
}
