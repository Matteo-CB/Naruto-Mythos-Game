import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter } from '../../defeatUtils';

/**
 * Card 120/130 - GAARA (R)
 * Also applies to 120/130 A (Rare Art variant - same effects, handled by registry normalization)
 * Chakra: 4, Power: 4
 * Group: Sand Village, Keywords: Team Baki
 *
 * MAIN: Defeat up to 1 enemy character with Power 1 or less in every mission.
 *   - For each mission, if there are multiple valid targets, the player must choose.
 *   - "Up to 1" means the player can choose not to defeat anyone in a given mission.
 *
 * UPGRADE: POWERUP X, where X is the number of characters defeated by the MAIN effect.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function gaara120MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  let defeatedCount = 0;

  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Process missions sequentially. Auto-defeat when 1 target, ask when >1.
  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    const enemyChars = mission[enemySide];
    const validTargets = enemyChars.filter((c) => getEffectivePower(c) <= 1);

    if (validTargets.length === 0) {
      continue;
    }

    if (validTargets.length === 1) {
      // Auto-defeat the single target
      state = defeatEnemyCharacter(state, i, validTargets[0].instanceId, ctx.sourcePlayer);
      defeatedCount++;

      state = {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_DEFEAT',
          `Gaara (120): Defeated enemy ${validTargets[0].card.name_fr} (Power ${getEffectivePower(validTargets[0])}) in mission ${i}.`,
          'game.log.effect.defeat',
          { card: 'GAARA', id: 'KS-120-R', target: validTargets[0].card.name_fr },
        ),
      };
      continue;
    }

    // Multiple targets in this mission — need player selection
    // Store context for the multi-stage chain in the description field as JSON
    return {
      state,
      requiresTargetSelection: true,
      targetSelectionType: 'GAARA120_CHOOSE_DEFEAT',
      validTargets: validTargets.map((c) => c.instanceId),
      description: JSON.stringify({
        defeatedCount,
        nextMissionIndex: i + 1,
        isUpgrade: ctx.isUpgrade,
        sourceInstanceId: ctx.sourceCard.instanceId,
        sourceMissionIndex: ctx.sourceMissionIndex,
        missionIndex: i,
        text: `Gaara (120): Choose an enemy character with Power 1 or less to defeat in mission ${i + 1}.`,
      }),
      descriptionKey: 'game.effect.desc.gaara120ChooseDefeat',
      descriptionParams: { mission: String(i + 1) },
    };
  }

  // All missions processed without needing selection
  if (defeatedCount === 0) {
    state = {
      ...state,
      log: logAction(
        state.log, state.turn, state.phase, ctx.sourcePlayer,
        'EFFECT_NO_TARGET',
        'Gaara (120): No enemy characters with Power 1 or less found in any mission.',
        'game.log.effect.noTarget',
        { card: 'GAARA', id: 'KS-120-R' },
      ),
    };
  }

  // Apply UPGRADE POWERUP if applicable
  if (ctx.isUpgrade && defeatedCount > 0) {
    state = applyGaaraUpgradePowerup(state, ctx.sourcePlayer, ctx.sourceCard.instanceId, ctx.sourceMissionIndex, defeatedCount);
  }

  return { state };
}

/**
 * Apply UPGRADE POWERUP X where X = defeatedCount on Gaara.
 */
function applyGaaraUpgradePowerup(
  state: import('../../../engine/types').GameState,
  sourcePlayer: import('../../../engine/types').PlayerID,
  sourceInstanceId: string,
  sourceMissionIndex: number,
  defeatedCount: number,
): import('../../../engine/types').GameState {
  const missions = [...state.activeMissions];
  const mission = { ...missions[sourceMissionIndex] };
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const friendlyChars = [...mission[friendlySide]];
  const selfIndex = friendlyChars.findIndex((c) => c.instanceId === sourceInstanceId);

  if (selfIndex !== -1) {
    friendlyChars[selfIndex] = {
      ...friendlyChars[selfIndex],
      powerTokens: friendlyChars[selfIndex].powerTokens + defeatedCount,
    };
    mission[friendlySide] = friendlyChars;
    missions[sourceMissionIndex] = mission;

    return {
      ...state,
      activeMissions: missions,
      log: logAction(
        state.log, state.turn, state.phase, sourcePlayer,
        'EFFECT_POWERUP',
        `Gaara (120): POWERUP ${defeatedCount} (upgrade, X = characters defeated by MAIN).`,
        'game.log.effect.powerupSelf',
        { card: 'GAARA', id: 'KS-120-R', amount: defeatedCount },
      ),
    };
  }
  return state;
}

function gaara120UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler when isUpgrade is true.
  return { state: ctx.state };
}

export function registerGaara120Handlers(): void {
  registerEffect('KS-120-R', 'MAIN', gaara120MainHandler);
  registerEffect('KS-120-R', 'UPGRADE', gaara120UpgradeHandler);
}
