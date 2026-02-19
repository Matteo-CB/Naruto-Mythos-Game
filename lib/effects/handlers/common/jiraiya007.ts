import type { EffectContext, EffectResult } from '../../EffectTypes';
import type { CharacterInPlay } from '../../../engine/types';
import { registerEffect } from '../../EffectRegistry';
import { generateInstanceId } from '../../../engine/utils/id';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 007/130 - JIRAYA (Common)
 * Chakra: 4 | Power: 4
 * Group: Leaf Village | Keywords: Sannin
 * MAIN: Play a Summon character anywhere, paying 1 less.
 *
 * Auto-resolves: plays the first affordable Summon card from hand on the current mission.
 */
function handleJiraiya007Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const playerState = state[sourcePlayer];

  // Find all Summon cards in hand
  const summonCards: { index: number; card: typeof playerState.hand[0] }[] = [];
  for (let i = 0; i < playerState.hand.length; i++) {
    const card = playerState.hand[i];
    if (card.keywords && card.keywords.includes('Summon')) {
      summonCards.push({ index: i, card });
    }
  }

  if (summonCards.length === 0) {
    return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
      'Jiraiya (007): No Summon characters in hand.',
      'game.log.effect.noTarget', { card: 'JIRAIYA', id: '007/130' }) } };
  }

  // Auto-resolve: play first affordable summon on best mission
  const newState = { ...state };
  const ps = { ...newState[sourcePlayer] };
  ps.hand = [...ps.hand];

  for (const summon of summonCards) {
    const cost = Math.max(0, summon.card.chakra - 1);
    if (ps.chakra < cost) continue;

    const missionOrder = [sourceMissionIndex, ...state.activeMissions.map((_, i) => i).filter(i => i !== sourceMissionIndex)];

    for (const mIdx of missionOrder) {
      if (mIdx >= state.activeMissions.length) continue;
      const mission = state.activeMissions[mIdx];
      const friendlyChars = sourcePlayer === 'player1' ? mission.player1Characters : mission.player2Characters;
      const hasSameName = friendlyChars.some(c => {
        const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        return topCard.name_fr === summon.card.name_fr;
      });
      if (hasSameName) continue;

      ps.chakra -= cost;
      ps.hand.splice(summon.index, 1);

      const charInPlay: CharacterInPlay = {
        instanceId: generateInstanceId(),
        card: summon.card,
        isHidden: false,
        powerTokens: 0,
        stack: [summon.card],
        controlledBy: sourcePlayer,
        originalOwner: sourcePlayer,
        missionIndex: mIdx,
      };

      const newMissions = [...state.activeMissions];
      const newMission = { ...newMissions[mIdx] };
      if (sourcePlayer === 'player1') {
        newMission.player1Characters = [...newMission.player1Characters, charInPlay];
      } else {
        newMission.player2Characters = [...newMission.player2Characters, charInPlay];
      }
      newMissions[mIdx] = newMission;

      let charCount = 0;
      for (const m of newMissions) {
        charCount += (sourcePlayer === 'player1' ? m.player1Characters : m.player2Characters).length;
      }
      ps.charactersInPlay = charCount;

      newState[sourcePlayer] = ps;
      newState.activeMissions = newMissions;
      newState.log = logAction(
        state.log, state.turn, 'action', sourcePlayer,
        'EFFECT', `Jiraiya plays ${summon.card.name_fr} as Summon on mission ${mIdx + 1} for ${cost} chakra.`,
        'game.log.effect.playSummon', { card: 'Jiraya', id: '007/130', target: summon.card.name_fr, mission: String(mIdx + 1), cost: String(cost) },
      );
      return { state: newState };
    }
  }

  return { state: { ...state, log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
    'Jiraiya (007): No affordable Summon could be played on any mission.',
    'game.log.effect.noTarget', { card: 'JIRAIYA', id: '007/130' }) } };
}

export function registerHandler(): void {
  registerEffect('007/130', 'MAIN', handleJiraiya007Main);
}
