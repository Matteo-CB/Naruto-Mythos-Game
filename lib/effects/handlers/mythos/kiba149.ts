import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter, defeatFriendlyCharacter } from '../../defeatUtils';
import { getEffectivePower } from '../../powerUtils';

/**
 * Card 149/130 - KIBA INUZUKA (M)
 * Chakra: 5, Power: 4
 * Group: Leaf Village, Keywords: Team 8
 *
 * MAIN: Hide a friendly Akamaru in play; if you do, hide another character
 *       in this mission (not self, not the Akamaru just hidden).
 *   - Step 1: Find a friendly non-hidden Akamaru across all missions. Hide it.
 *   - Step 2: If Akamaru was hidden, find another non-hidden character in this
 *     mission (friend or foe, not self, not the Akamaru). Target selection. Hide it.
 *   - If no friendly Akamaru is found, fizzles.
 *
 * UPGRADE: MAIN effect changes: instead of hiding, defeat both targets.
 *   - When isUpgrade: defeat the Akamaru and defeat the other character.
 */

function kiba149MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  const useDefeat = ctx.isUpgrade;

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Step 1: Find a friendly non-hidden Akamaru in play
  let akamaru: CharacterInPlay | null = null;
  let akamaruMissionIndex = -1;

  for (let i = 0; i < state.activeMissions.length; i++) {
    for (const char of state.activeMissions[i][friendlySide]) {
      if (char.isHidden) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.name_fr.toUpperCase().includes('AKAMARU')) {
        akamaru = char;
        akamaruMissionIndex = i;
        break;
      }
    }
    if (akamaru) break;
  }

  if (!akamaru || akamaruMissionIndex === -1) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kiba Inuzuka (149): No friendly non-hidden Akamaru in play, effect fizzles.',
      'game.log.effect.noTarget',
      { card: 'KIBA INUZUKA', id: 'KS-149-M' },
    );
    return { state: { ...state, log } };
  }

  // Apply to Akamaru: hide or defeat
  if (useDefeat) {
    state = defeatFriendlyCharacter(state, akamaruMissionIndex, akamaru.instanceId, ctx.sourcePlayer);
    state = {
      ...state,
      log: logAction(
        state.log, state.turn, state.phase, ctx.sourcePlayer,
        'EFFECT_DEFEAT',
        `Kiba Inuzuka (149): Defeated friendly ${akamaru.card.name_fr} (upgrade).`,
        'game.log.effect.defeat',
        { card: 'KIBA INUZUKA', id: 'KS-149-M', target: akamaru.card.name_fr },
      ),
    };
  } else {
    // Hide Akamaru
    const missions = [...state.activeMissions];
    const mission = { ...missions[akamaruMissionIndex] };
    const chars = [...mission[friendlySide]];
    const idx = chars.findIndex((c) => c.instanceId === akamaru!.instanceId);
    if (idx !== -1) {
      chars[idx] = { ...chars[idx], isHidden: true };
      mission[friendlySide] = chars;
      missions[akamaruMissionIndex] = mission;
      state = {
        ...state,
        activeMissions: missions,
        log: logAction(
          state.log, state.turn, state.phase, ctx.sourcePlayer,
          'EFFECT_HIDE',
          `Kiba Inuzuka (149): Hid friendly ${akamaru.card.name_fr}.`,
          'game.log.effect.hide',
          { card: 'KIBA INUZUKA', id: 'KS-149-M', target: akamaru.card.name_fr, mission: `mission ${akamaruMissionIndex}` },
        ),
      };
    }
  }

  // Step 2: Find another non-hidden character in THIS mission (not self, not Akamaru)
  const thisMission = state.activeMissions[ctx.sourceMissionIndex];
  const validTargets: string[] = [];

  // Check friendly side
  for (const char of thisMission[friendlySide]) {
    if (char.isHidden) continue;
    if (char.instanceId === ctx.sourceCard.instanceId) continue;
    if (char.instanceId === akamaru.instanceId) continue;
    validTargets.push(char.instanceId);
  }

  // Check enemy side
  for (const char of thisMission[enemySide]) {
    if (char.isHidden) continue;
    validTargets.push(char.instanceId);
  }

  if (validTargets.length === 0) {
    state = {
      ...state,
      log: logAction(
        state.log, state.turn, state.phase, ctx.sourcePlayer,
        'EFFECT_NO_TARGET',
        'Kiba Inuzuka (149): No other non-hidden character in this mission to target.',
        'game.log.effect.noTarget',
        { card: 'KIBA INUZUKA', id: 'KS-149-M' },
      ),
    };
    return { state };
  }

  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: useDefeat ? 'KIBA149_CHOOSE_DEFEAT_TARGET' : 'KIBA149_CHOOSE_HIDE_TARGET',
    validTargets,
    description: useDefeat
      ? 'Kiba Inuzuka (149): Choose another character in this mission to defeat.'
      : 'Kiba Inuzuka (149): Choose another character in this mission to hide.',
    descriptionKey: useDefeat
      ? 'game.effect.desc.kiba149Defeat'
      : 'game.effect.desc.kiba149Hide',
  };
}

function kiba149UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler when isUpgrade is true.
  return { state: ctx.state };
}

export function registerKiba149Handlers(): void {
  registerEffect('KS-149-M', 'MAIN', kiba149MainHandler);
  registerEffect('KS-149-M', 'UPGRADE', kiba149UpgradeHandler);
}
