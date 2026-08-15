import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CardData, CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { calculateCharacterPower } from '@/lib/engine/phases/PowerCalculation';
import { confirmFirst } from './confirmFirst';

export const ASUMA_138 = 'SS-138-R';
export const ASUMA_138_VARIANTS = [ASUMA_138, 'SS-138-RA'];

function refus(state: GameState, player: PlayerID, texte: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', texte,
        'game.log.effect.noTarget', { card: 'ASUMA SARUTOBI', id: ASUMA_138 }),
    },
  };
}

export function ennemisDeMemePuissance(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  sourceInstanceId: string,
): CharacterInPlay[] {
  const mission = state.activeMissions[missionIndex];
  if (!mission) return [];
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  const source = mission[side].find((c) => c.instanceId === sourceInstanceId);
  if (!source) return [];
  const puissanceSource = calculateCharacterPower(state, source, player);

  const adversaire: PlayerID = player === 'player1' ? 'player2' : 'player1';
  const sideEnnemi = adversaire === 'player1' ? 'player1Characters' : 'player2Characters';
  return mission[sideEnnemi].filter((c) =>
    calculateCharacterPower(state, c, adversaire) === puissanceSource);
}

function asuma138Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const main = state[sourcePlayer].hand as unknown as CardData[];
  if (main.length === 0) {
    return refus(state, sourcePlayer, 'Asuma Sarutobi (138): no card in hand to discard.');
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS138_DISCARD_FOR_POWER',
    validTargets: main.map((_, i) => String(i)),
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss138DiscardForPower',
  }, sourceCard.instanceId, 'SS138_CONFIRM_MAIN');
}

function asuma138Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex } = ctx;
  const cibles = ennemisDeMemePuissance(state, sourcePlayer, sourceMissionIndex, sourceCard.instanceId);
  if (cibles.length === 0) {
    return refus(state, sourcePlayer,
      'Asuma Sarutobi (138) UPGRADE: no enemy character here has the same Power.');
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS138_DEFEAT_EQUAL',
    validTargets: cibles.map((c) => c.instanceId),
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss138DefeatEqual',
  }, sourceCard.instanceId, 'SS138_CONFIRM_UPGRADE');
}

export function registerAsuma138Handlers(): void {
  for (const id of ASUMA_138_VARIANTS) {
    registerEffect(id, 'MAIN', asuma138Main);
    registerEffect(id, 'UPGRADE', asuma138Upgrade);
  }
}
