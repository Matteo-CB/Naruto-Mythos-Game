import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import { logAction } from '../../../engine/utils/gameLog';
import { defeatEnemyCharacter, defeatFriendlyCharacter } from '../../defeatUtils';
import type { CharacterInPlay } from '../../../engine/types';

/**
 * Card 113/130 - KIBA INUZUKA (R)
 * Chakra: 4, Power: 3
 * Group: Leaf Village, Keywords: Team 8
 *
 * MAIN: Hide a friendly Akamaru in play; if you do, hide another character in this mission.
 *   1. Find a friendly Akamaru (non-hidden, name_fr contains "Akamaru") in play.
 *   2. Hide that Akamaru.
 *   3. Then hide another character in this mission (not self, not the hidden Akamaru).
 *   Requires target selection if multiple valid targets for the second hide.
 *
 * UPGRADE: Instead of hiding both targets, defeat them both.
 *   When isUpgrade: defeat instead of hide.
 */

function kiba113MainHandler(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard, sourceMissionIndex, isUpgrade } = ctx;
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Step 1: Find a friendly Akamaru in play (any mission, non-hidden)
  let akamaruChar: CharacterInPlay | null = null;
  let akamaruMissionIdx = -1;

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    const friendlyChars = mission[friendlySide];
    for (const char of friendlyChars) {
      if (!char.isHidden) {
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        if (topCard.name_fr.toLowerCase().includes('akamaru')) {
          akamaruChar = char;
          akamaruMissionIdx = i;
          break;
        }
      }
    }
    if (akamaruChar) break;
  }

  if (!akamaruChar) {
    return {
      state: {
        ...state,
        log: logAction(
          state.log, state.turn, state.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kiba Inuzuka (113): No friendly non-hidden Akamaru in play.',
          'game.log.effect.noTarget',
          { card: 'KIBA INUZUKA', id: '113/130' },
        ),
      },
    };
  }

  let newState = { ...state };

  // Step 2: Hide (or defeat if upgrade) the Akamaru
  if (isUpgrade) {
    newState = defeatFriendlyCharacter(newState, akamaruMissionIdx, akamaruChar.instanceId, sourcePlayer);
    newState = {
      ...newState,
      log: logAction(
        newState.log, newState.turn, newState.phase, sourcePlayer,
        'EFFECT_DEFEAT',
        `Kiba Inuzuka (113) UPGRADE: Defeated friendly Akamaru in mission ${akamaruMissionIdx}.`,
        'game.log.effect.defeat',
        { card: 'KIBA INUZUKA', id: '113/130', target: akamaruChar.card.name_fr },
      ),
    };
  } else {
    const missions = [...newState.activeMissions];
    const akaMission = { ...missions[akamaruMissionIdx] };
    const akaChars = [...akaMission[friendlySide]];
    const akaIdx = akaChars.findIndex((c) => c.instanceId === akamaruChar!.instanceId);
    if (akaIdx !== -1) {
      akaChars[akaIdx] = { ...akaChars[akaIdx], isHidden: true };
      akaMission[friendlySide] = akaChars;
      missions[akamaruMissionIdx] = akaMission;
      newState = {
        ...newState,
        activeMissions: missions,
        log: logAction(
          newState.log, newState.turn, newState.phase, sourcePlayer,
          'EFFECT_HIDE',
          `Kiba Inuzuka (113): Hid friendly Akamaru in mission ${akamaruMissionIdx}.`,
          'game.log.effect.hide',
          { card: 'KIBA INUZUKA', id: '113/130', target: 'Akamaru' },
        ),
      };
    }
  }

  // Step 3: Find another character in this mission to hide/defeat (not self, not the Akamaru)
  const currentMission = newState.activeMissions[sourceMissionIndex];
  const allCharsInMission: Array<{ char: CharacterInPlay; side: 'player1Characters' | 'player2Characters' }> = [];

  for (const char of currentMission[friendlySide]) {
    if (char.instanceId !== sourceCard.instanceId && char.instanceId !== akamaruChar.instanceId && !char.isHidden) {
      allCharsInMission.push({ char, side: friendlySide });
    }
  }
  for (const char of currentMission[enemySide]) {
    if (!char.isHidden) {
      allCharsInMission.push({ char, side: enemySide });
    }
  }

  if (allCharsInMission.length === 0) {
    return {
      state: {
        ...newState,
        log: logAction(
          newState.log, newState.turn, newState.phase, sourcePlayer,
          'EFFECT_NO_TARGET',
          'Kiba Inuzuka (113): No other character in this mission to target.',
          'game.log.effect.noTarget',
          { card: 'KIBA INUZUKA', id: '113/130' },
        ),
      },
    };
  }

  // If only one target, auto-resolve
  if (allCharsInMission.length === 1) {
    const target = allCharsInMission[0];
    if (isUpgrade) {
      // Defeat the target
      if (target.side === enemySide) {
        newState = defeatEnemyCharacter(newState, sourceMissionIndex, target.char.instanceId, sourcePlayer);
      } else {
        newState = defeatFriendlyCharacter(newState, sourceMissionIndex, target.char.instanceId, sourcePlayer);
      }
      newState = {
        ...newState,
        log: logAction(
          newState.log, newState.turn, newState.phase, sourcePlayer,
          'EFFECT_DEFEAT',
          `Kiba Inuzuka (113) UPGRADE: Defeated ${target.char.card.name_fr} in this mission.`,
          'game.log.effect.defeat',
          { card: 'KIBA INUZUKA', id: '113/130', target: target.char.card.name_fr },
        ),
      };
    } else {
      // Hide the target
      const missions = [...newState.activeMissions];
      const m = { ...missions[sourceMissionIndex] };
      const chars = [...m[target.side]];
      const idx = chars.findIndex((c) => c.instanceId === target.char.instanceId);
      if (idx !== -1) {
        chars[idx] = { ...chars[idx], isHidden: true };
        m[target.side] = chars;
        missions[sourceMissionIndex] = m;
        newState = {
          ...newState,
          activeMissions: missions,
          log: logAction(
            newState.log, newState.turn, newState.phase, sourcePlayer,
            'EFFECT_HIDE',
            `Kiba Inuzuka (113): Hid ${target.char.card.name_fr} in this mission.`,
            'game.log.effect.hide',
            { card: 'KIBA INUZUKA', id: '113/130', target: target.char.card.name_fr },
          ),
        };
      }
    }

    return { state: newState };
  }

  // Multiple targets: requires selection
  const validTargets = allCharsInMission.map((t) => t.char.instanceId);
  return {
    state: newState,
    requiresTargetSelection: true,
    targetSelectionType: isUpgrade ? 'KIBA113_DEFEAT_TARGET' : 'KIBA113_HIDE_TARGET',
    validTargets,
    description: isUpgrade
      ? 'Kiba Inuzuka (113) UPGRADE: Choose a character in this mission to defeat.'
      : 'Kiba Inuzuka (113): Choose a character in this mission to hide.',
  };
}

function kiba113UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE logic is integrated into MAIN handler via isUpgrade flag.
  return { state: ctx.state };
}

export function registerKiba113Handlers(): void {
  registerEffect('113/130', 'MAIN', kiba113MainHandler);
  registerEffect('113/130', 'UPGRADE', kiba113UpgradeHandler);
}
