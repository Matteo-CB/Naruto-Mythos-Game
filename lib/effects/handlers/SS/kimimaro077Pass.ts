import type { GameState, PlayerID, PendingAction } from '@/lib/engine/types';
import { generateInstanceId } from '@/lib/engine/utils/id';
import {
  KIMIMARO_077_ID,
  kimimaro077InPlay,
  kimimaro077Limit,
  kimimaro077HasAffordableTarget,
} from './kimimaro077';

export function offerKimimaro077Sacrifice(state: GameState, player: PlayerID): GameState {
  const sources = kimimaro077InPlay(state, player);
  if (sources.length === 0) return state;

  let suivant = state;

  for (const source of sources) {
    const limite = kimimaro077Limit(suivant, source);
    if (!kimimaro077HasAffordableTarget(suivant, player, limite)) continue;

    const effId = generateInstanceId();
    const actId = generateInstanceId();

    suivant = {
      ...suivant,
      pendingEffects: [...suivant.pendingEffects, {
        id: effId,
        sourceCardId: KIMIMARO_077_ID,
        sourceInstanceId: source.instanceId,
        sourceMissionIndex: source.missionIndex,
        effectType: 'MAIN',
        effectDescription: JSON.stringify({ limite, sourceInstanceId: source.instanceId }),
        targetSelectionType: 'SS077_CONFIRM_SACRIFICE',
        sourcePlayer: player,
        requiresTargetSelection: true,
        validTargets: [source.instanceId],
        isOptional: true,
        isMandatory: false,
        resolved: false,
        isUpgrade: false,
        remainingEffectTypes: undefined,
      }],
      pendingActions: [...suivant.pendingActions, {
        id: actId,
        type: 'SELECT_TARGET' as PendingAction['type'],
        player,
        description: 'Defeat Kimimaro to defeat enemy characters within the cost budget?',
        descriptionKey: limite === 7
          ? 'game.effect.desc.ss077ConfirmDuel'
          : 'game.effect.desc.ss077Confirm',
        options: [source.instanceId],
        minSelections: 1,
        maxSelections: 1,
        sourceEffectId: effId,
      }],
    };
  }

  return suivant;
}
