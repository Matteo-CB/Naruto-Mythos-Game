import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

export const KURENAI_018 = 'SS-018-UC';
export const KURENAI_018_VARIANTS = [KURENAI_018];
export const TEAM_8 = 'Team 8';

function topOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

export function team8AlliesIn(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  sourceInstanceId: string,
): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  return mission[side].filter((c) =>
    !c.isHidden
    && c.instanceId !== sourceInstanceId
    && (topOf(c).keywords ?? []).includes(TEAM_8));
}

function kurenaiResult(confirmType: string) {
  return (ctx: EffectContext): EffectResult => {
    const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
    const cibles = team8AlliesIn(state, sourcePlayer, sourceMissionIndex, sourceCard.instanceId);
    if (cibles.length === 0) {
      return {
        state: {
          ...state,
          log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
            'Kurenai Yuhi (018): no other friendly Team 8 character in this mission.',
            'game.log.effect.noTarget', { card: 'KURENAI YUHI', id: KURENAI_018 }),
        },
      };
    }
    return {
      state,
      requiresTargetSelection: true,
      targetSelectionType: confirmType,
      validTargets: [sourceCard.instanceId],
      isOptional: true,
      description: JSON.stringify({}),
      descriptionKey: 'game.effect.desc.ss018PowerupTeam8',
    };
  };
}

export function registerKurenai018Handlers(): void {
  for (const id of KURENAI_018_VARIANTS) {
    registerEffect(id, 'MAIN', kurenaiResult('SS018_CONFIRM_MAIN'));
    registerEffect(id, 'UPGRADE', kurenaiResult('SS018_CONFIRM_UPGRADE'));
  }
}
