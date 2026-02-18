import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay, PlayerID } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 120/130 - GAARA (R)
 * Also applies to 120/130 A (Rare Art variant - same effects, handled by registry normalization)
 * Chakra: 4, Power: 4
 * Group: Sand Village, Keywords: Team Baki
 *
 * MAIN: Defeat up to 1 enemy character with Power 1 or less in every mission.
 *   - Iterates all active missions.
 *   - In each mission, can defeat up to 1 enemy character with effective power <= 1.
 *
 * UPGRADE: POWERUP X, where X is the number of characters defeated by the MAIN effect.
 *   - Only applies when this card is played as an upgrade.
 *   - Add X power tokens to self, where X = number of characters defeated.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function defeatCharacter(
  state: ReturnType<typeof Object.assign>,
  missionIndex: number,
  charInstanceId: string,
  sourcePlayer: PlayerID,
): ReturnType<typeof Object.assign> {
  const missions = [...state.activeMissions];
  const mission = { ...missions[missionIndex] };

  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  const chars = [...mission[enemySide]];
  const charIndex = chars.findIndex((c) => c.instanceId === charInstanceId);

  if (charIndex === -1) return state;

  const defeated = chars[charIndex];
  chars.splice(charIndex, 1);
  mission[enemySide] = chars;
  missions[missionIndex] = mission;

  // Add defeated card (and stack) to original owner's discard pile
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

function gaara120MainHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };
  let defeatedCount = 0;

  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Iterate all active missions
  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    const enemyChars = mission[enemySide];

    // Find first valid target: non-hidden enemy character with effective power <= 1
    const target = enemyChars.find((c) => !c.isHidden && getEffectivePower(c) <= 1);

    if (target) {
      state = defeatCharacter(state, i, target.instanceId, ctx.sourcePlayer);
      defeatedCount++;

      state = {
        ...state,
        log: logAction(
          state.log,
          state.turn,
          state.phase,
          ctx.sourcePlayer,
          'EFFECT_DEFEAT',
          `Gaara (120): Defeated enemy ${target.card.name_fr} (Power ${getEffectivePower(target)}) in mission ${i}.`,
        ),
      };
    }
  }

  if (defeatedCount === 0) {
    state = {
      ...state,
      log: logAction(
        state.log,
        state.turn,
        state.phase,
        ctx.sourcePlayer,
        'EFFECT_NO_TARGET',
        'Gaara (120): No enemy characters with Power 1 or less found in any mission.',
      ),
    };
  }

  // Store defeated count for the UPGRADE handler to reference
  // We use a convention: store it on the state log so UPGRADE can read it.
  // Since MAIN runs before UPGRADE, and both are in the same resolution,
  // we store the count temporarily. The UPGRADE handler will read the last
  // EFFECT_DEFEAT log entries to count them.
  // Alternatively, we handle it directly here if isUpgrade is true.
  if (ctx.isUpgrade && defeatedCount > 0) {
    const missions = [...state.activeMissions];
    const mission = { ...missions[ctx.sourceMissionIndex] };
    const friendlySide: 'player1Characters' | 'player2Characters' =
      ctx.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
    const friendlyChars = [...mission[friendlySide]];
    const selfIndex = friendlyChars.findIndex((c) => c.instanceId === ctx.sourceCard.instanceId);

    if (selfIndex !== -1) {
      friendlyChars[selfIndex] = {
        ...friendlyChars[selfIndex],
        powerTokens: friendlyChars[selfIndex].powerTokens + defeatedCount,
      };
      mission[friendlySide] = friendlyChars;
      missions[ctx.sourceMissionIndex] = mission;

      state = {
        ...state,
        activeMissions: missions,
        log: logAction(
          state.log,
          state.turn,
          state.phase,
          ctx.sourcePlayer,
          'EFFECT_POWERUP',
          `Gaara (120): POWERUP ${defeatedCount} (upgrade, X = characters defeated by MAIN).`,
        ),
      };
    }
  }

  return { state };
}

function gaara120UpgradeHandler(ctx: EffectContext): EffectResult {
  // The UPGRADE effect (POWERUP X where X = defeated count) is already handled
  // in the MAIN handler when isUpgrade is true. This is because MAIN runs first
  // and we need the defeated count from the same resolution pass.
  //
  // If somehow UPGRADE is called separately (by the EffectEngine after MAIN),
  // we count recent EFFECT_DEFEAT log entries from Gaara to determine X.
  // However, the EffectEngine resolves MAIN first then UPGRADE, and the defeated
  // count has already been applied in MAIN when isUpgrade is true.
  //
  // This handler is a safety no-op since the logic is integrated into MAIN.
  return { state: ctx.state };
}

export function registerGaara120Handlers(): void {
  registerEffect('120/130', 'MAIN', gaara120MainHandler);
  registerEffect('120/130', 'UPGRADE', gaara120UpgradeHandler);
}
