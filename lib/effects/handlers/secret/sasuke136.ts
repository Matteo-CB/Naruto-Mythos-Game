import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay, GameState, PlayerID } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 136/130 - SASUKE UCHIWA "Marque maudite du Ciel" (S)
 * Chakra: 7, Power: 8
 * Group: Leaf Village, Keywords: Team 7
 *
 * MAIN [hourglass]: When a character is defeated, gain 1 Chakra.
 *   - This is a continuous/passive effect. It triggers whenever ANY character
 *     (friendly or enemy) is defeated while Sasuke is face-visible in play.
 *   - The actual trigger logic must be checked by the defeat resolution system
 *     (EffectEngine.checkDefeatReplacement or a dedicated on_character_defeated hook).
 *   - This handler is a no-op; the continuous effect is registered passively.
 *
 * UPGRADE: You must choose a friendly non-hidden character and any enemy character
 *          in this mission and defeat them, if able.
 *   - Both must be defeated (mutual destruction).
 *   - "if able" means the effect is mandatory IF valid targets exist.
 *   - The friendly character chosen cannot be Sasuke himself (must be another).
 */

function defeatCharacterInMission(
  state: GameState,
  missionIndex: number,
  charInstanceId: string,
  side: 'player1Characters' | 'player2Characters',
): GameState {
  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIndex] };
  const chars = [...mission[side]];
  const charIndex = chars.findIndex((c) => c.instanceId === charInstanceId);

  if (charIndex === -1) return state;

  const defeated = chars[charIndex];
  chars.splice(charIndex, 1);
  mission[side] = chars;
  missions[missionIndex] = mission;

  // Add defeated card to original owner's discard pile
  const owner = defeated.originalOwner;
  const ownerState = { ...state[owner] };
  const cardsToDiscard = defeated.stack.length > 0 ? [...defeated.stack] : [defeated.card];
  ownerState.discardPile = [...ownerState.discardPile, ...cardsToDiscard];
  ownerState.charactersInPlay = Math.max(0, ownerState.charactersInPlay - 1);

  return {
    ...state,
    activeMissions: missions,
    [owner]: ownerState,
  };
}

function sasuke136MainHandler(ctx: EffectContext): EffectResult {
  // Continuous effect [hourglass]: When a character is defeated, gain 1 Chakra.
  // This is passively checked by the defeat resolution system.
  // No immediate state change needed.
  const state = ctx.state;
  const log = logAction(
    state.log,
    state.turn,
    state.phase,
    ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Sasuke Uchiwa (136): Gain 1 Chakra when any character is defeated (continuous).',
  );
  return { state: { ...state, log } };
}

function sasuke136UpgradeHandler(ctx: EffectContext): EffectResult {
  // UPGRADE: Must defeat a friendly non-hidden character AND an enemy character
  // in this mission, if able.
  let state = { ...ctx.state };
  const mission = state.activeMissions[ctx.sourceMissionIndex];

  const friendlySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  const friendlyChars = mission[friendlySide];
  const enemyChars = mission[enemySide];

  // Find first valid friendly target: non-hidden, NOT self (not Sasuke 136)
  const friendlyTarget = friendlyChars.find(
    (c) => !c.isHidden && c.instanceId !== ctx.sourceCard.instanceId,
  );

  // Find first valid enemy target: any enemy character in this mission
  const enemyTarget = enemyChars.find((c) => true); // Any enemy, hidden or not

  if (!friendlyTarget || !enemyTarget) {
    // "if able" - no valid targets, effect does not trigger
    const log = logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Sasuke Uchiwa (136): No valid targets for mutual destruction (upgrade). Need both a friendly non-hidden and an enemy character.',
    );
    return { state: { ...state, log } };
  }

  // Defeat both characters
  state = defeatCharacterInMission(
    state,
    ctx.sourceMissionIndex,
    friendlyTarget.instanceId,
    friendlySide,
  );

  state = {
    ...state,
    log: logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_DEFEAT',
      `Sasuke Uchiwa (136): Defeated friendly ${friendlyTarget.card.name_fr} (mutual destruction, upgrade).`,
    ),
  };

  state = defeatCharacterInMission(
    state,
    ctx.sourceMissionIndex,
    enemyTarget.instanceId,
    enemySide,
  );

  state = {
    ...state,
    log: logAction(
      state.log,
      state.turn,
      state.phase,
      ctx.sourcePlayer,
      'EFFECT_DEFEAT',
      `Sasuke Uchiwa (136): Defeated enemy ${enemyTarget.card.name_fr} (mutual destruction, upgrade).`,
    ),
  };

  return { state };
}

export function registerSasuke136Handlers(): void {
  registerEffect('136/130', 'MAIN', sasuke136MainHandler);
  registerEffect('136/130', 'UPGRADE', sasuke136UpgradeHandler);
}
