import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * MSS 04 - "Assassinat" / "Assassination"
 *
 * SCORE [arrow]: Defeat an enemy hidden character.
 *   - The scoring player can defeat one hidden enemy character anywhere in play.
 *   - For automated play: pick the first hidden enemy character found.
 *   - If no hidden enemy characters exist, nothing happens.
 */

function mss04ScoreHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };

  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Find first hidden enemy character in any mission
  let targetChar: CharacterInPlay | undefined;
  let targetMissionIndex = -1;
  let targetCharIndex = -1;

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    const chars = mission[enemySide];
    for (let j = 0; j < chars.length; j++) {
      if (chars[j].isHidden) {
        targetChar = chars[j];
        targetMissionIndex = i;
        targetCharIndex = j;
        break;
      }
    }
    if (targetChar) break;
  }

  if (!targetChar || targetMissionIndex === -1) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'SCORE_NO_TARGET',
      'MSS 04 (Assassination): No hidden enemy character to defeat.',
    );
    return { state: { ...state, log } };
  }

  // Defeat the hidden enemy character
  const missions = [...state.activeMissions];
  const mission = { ...missions[targetMissionIndex] };
  const chars = [...mission[enemySide]];
  const defeated = chars[targetCharIndex];
  chars.splice(targetCharIndex, 1);
  mission[enemySide] = chars;
  missions[targetMissionIndex] = mission;

  // Add to original owner's discard pile
  const owner = defeated.originalOwner;
  const ownerState = { ...state[owner] };
  const cardsToDiscard = defeated.stack.length > 0 ? [...defeated.stack] : [defeated.card];
  ownerState.discardPile = [...ownerState.discardPile, ...cardsToDiscard];
  ownerState.charactersInPlay = Math.max(0, ownerState.charactersInPlay - 1);

  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'SCORE_DEFEAT',
    `MSS 04 (Assassination): Defeated hidden enemy character ${defeated.card.name_fr} in mission ${targetMissionIndex}.`,
  );

  return {
    state: {
      ...state,
      activeMissions: missions,
      [owner]: ownerState,
      log,
    },
  };
}

export function registerMss04Handlers(): void {
  registerEffect('MSS 04', 'SCORE', mss04ScoreHandler);
}
