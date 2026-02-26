import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CharacterInPlay } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';

/**
 * Card 082/130 - BAKI "Wind Blade" (UC)
 * Chakra: 4 | Power: 4
 * Group: Sand Village | Keywords: Team Baki
 *
 * SCORE [arrow]: Defeat a hidden enemy character in play (any mission).
 *   - When the player wins the mission where Baki is assigned, they may defeat
 *     any single hidden ENEMY character in play.
 *   - If multiple hidden enemy characters exist, requires target selection.
 *   - If exactly one hidden enemy character, auto-apply.
 *
 * UPGRADE: POWERUP 1 on each friendly Sand Village character in this mission.
 *   - When played as upgrade, place 1 power token on each friendly Sand Village
 *     character assigned to this mission.
 */

function handleBaki082Score(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer } = ctx;

  // Find all hidden ENEMY characters in play across all missions
  const enemySide = sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const validTargets: string[] = [];
  for (const mission of state.activeMissions) {
    for (const char of mission[enemySide]) {
      if (char.isHidden) {
        validTargets.push(char.instanceId);
      }
    }
  }

  if (validTargets.length === 0) {
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'SCORE_NO_TARGET',
      'Baki (082): [SCORE] No hidden characters in play to defeat.',
      'game.log.effect.noTarget',
      { card: 'BAKI', id: 'KS-082-UC' },
    );
    return { state: { ...state, log } };
  }

  // If exactly one hidden target, auto-apply
  if (validTargets.length === 1) {
    const targetId = validTargets[0];
    let newState = defeatHiddenCharacter(state, targetId, sourcePlayer);
    return { state: newState };
  }

  // Multiple targets: requires selection
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'DEFEAT_HIDDEN_CHARACTER_ANY',
    validTargets,
    description: 'Baki (082) SCORE: Select a hidden character in play to defeat.',
    descriptionKey: 'game.effect.desc.baki082ScoreDefeatHidden',
  };
}

function handleBaki082Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceMissionIndex } = ctx;
  const friendlySide = sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';

  // POWERUP 1 on each friendly Sand Village character in this mission
  let count = 0;
  const updatedMissions = state.activeMissions.map((m, i) => {
    if (i !== sourceMissionIndex) return m;
    return {
      ...m,
      [friendlySide]: m[friendlySide].map((c: CharacterInPlay) => {
        if (c.isHidden) return c;
        const topCard = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        if (topCard.group === 'Sand Village') {
          count++;
          return { ...c, powerTokens: c.powerTokens + 1 };
        }
        return c;
      }),
    };
  });

  let newState = { ...state, activeMissions: updatedMissions };
  const log = logAction(
    newState.log,
    newState.turn,
    newState.phase,
    sourcePlayer,
    'EFFECT_POWERUP',
    `Baki (082) UPGRADE: POWERUP 1 on ${count} friendly Sand Village character(s) in this mission.`,
    'game.log.effect.powerup',
    { card: 'BAKI', id: 'KS-082-UC', count: String(count) },
  );
  return { state: { ...newState, log } };
}

/**
 * Defeat a hidden character by instanceId. Can be from any player's side.
 * Determines the correct mission and side, then uses defeatEnemyCharacter or
 * defeatFriendlyCharacter as appropriate.
 */
function defeatHiddenCharacter(
  state: import('@/lib/effects/EffectTypes').EffectContext['state'],
  instanceId: string,
  sourcePlayer: import('@/lib/engine/types').PlayerID,
): import('@/lib/effects/EffectTypes').EffectContext['state'] {
  // Find the character across all missions
  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const charIdx = mission[side].findIndex((c) => c.instanceId === instanceId);
      if (charIdx !== -1) {
        const targetChar = mission[side][charIdx];
        const isEnemy = (side === 'player1Characters' && sourcePlayer === 'player2') ||
                        (side === 'player2Characters' && sourcePlayer === 'player1');
        const { defeatCharacterInPlay } = require('@/lib/effects/defeatUtils');
        let newState = defeatCharacterInPlay(state, i, instanceId, side, isEnemy, sourcePlayer);
        const log = logAction(
          newState.log,
          newState.turn,
          newState.phase,
          sourcePlayer,
          'SCORE_DEFEAT',
          `Baki (082): [SCORE] Defeated hidden character ${targetChar.card.name_fr}.`,
          'game.log.score.defeat',
          { card: 'BAKI', id: 'KS-082-UC', target: targetChar.card.name_fr },
        );
        return { ...newState, log };
      }
    }
  }
  return state;
}

export function registerBaki082Handlers(): void {
  registerEffect('KS-082-UC', 'SCORE', handleBaki082Score);
  registerEffect('KS-082-UC', 'UPGRADE', handleBaki082Upgrade);
}
