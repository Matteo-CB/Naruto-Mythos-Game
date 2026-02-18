import type { GameState, PlayerID, CharacterInPlay, EffectType } from '../engine/types';
import type { EffectContext, EffectResult } from './EffectTypes';
import { getEffectHandler } from './EffectRegistry';
import { deepClone } from '../engine/utils/deepClone';
import { logAction } from '../engine/utils/gameLog';

/**
 * Central effect resolver.
 * Dispatches effects to their registered handlers.
 */
export class EffectEngine {
  /**
   * Resolve effects when a character is played face-visible.
   * Triggers MAIN effects.
   */
  static resolvePlayEffects(
    state: GameState,
    player: PlayerID,
    character: CharacterInPlay,
    missionIndex: number,
    isUpgrade: boolean,
  ): GameState {
    let newState = deepClone(state);
    const topCard = character.stack.length > 0 ? character.stack[character.stack.length - 1] : character.card;

    // First, check effects on existing cards in play (they trigger before the newly played card)
    // This is handled by the game engine before calling this method

    // Resolve MAIN effects — call the handler once per card (not once per MAIN entry)
    const hasMainEffect = (topCard.effects ?? []).some(
      (e) => e.type === 'MAIN' && !e.description.startsWith('effect:') && !e.description.startsWith('effect.')
    );
    if (hasMainEffect) {
      const handler = getEffectHandler(topCard.id, 'MAIN');
      if (handler) {
        const ctx: EffectContext = {
          state: newState,
          sourcePlayer: player,
          sourceCard: character,
          sourceMissionIndex: missionIndex,
          triggerType: 'MAIN',
          isUpgrade,
        };
        const result = handler(ctx);
        newState = result.state;
      }
    }

    // If this is an upgrade, also resolve UPGRADE effects (once per card)
    if (isUpgrade) {
      const hasUpgradeEffect = (topCard.effects ?? []).some((e) => e.type === 'UPGRADE');
      if (hasUpgradeEffect) {
        const handler = getEffectHandler(topCard.id, 'UPGRADE');
        if (handler) {
          const ctx: EffectContext = {
            state: newState,
            sourcePlayer: player,
            sourceCard: character,
            sourceMissionIndex: missionIndex,
            triggerType: 'UPGRADE',
            isUpgrade: true,
          };
          const result = handler(ctx);
          newState = result.state;
        }
      }
    }

    return newState;
  }

  /**
   * Resolve effects when a hidden character is revealed.
   * Triggers MAIN and AMBUSH effects.
   */
  static resolveRevealEffects(
    state: GameState,
    player: PlayerID,
    character: CharacterInPlay,
    missionIndex: number,
  ): GameState {
    let newState = deepClone(state);
    const topCard = character.stack.length > 0 ? character.stack[character.stack.length - 1] : character.card;

    // Resolve MAIN effects — call the handler once per card
    const hasMainEffect = (topCard.effects ?? []).some(
      (e) => e.type === 'MAIN' && !e.description.startsWith('effect:') && !e.description.startsWith('effect.')
    );
    if (hasMainEffect) {
      const handler = getEffectHandler(topCard.id, 'MAIN');
      if (handler) {
        const ctx: EffectContext = {
          state: newState,
          sourcePlayer: player,
          sourceCard: character,
          sourceMissionIndex: missionIndex,
          triggerType: 'MAIN',
          isUpgrade: false,
        };
        const result = handler(ctx);
        newState = result.state;
      }
    }

    // Resolve AMBUSH effects — call the handler once per card
    const hasAmbushEffect = (topCard.effects ?? []).some((e) => e.type === 'AMBUSH');
    if (hasAmbushEffect) {
      const handler = getEffectHandler(topCard.id, 'AMBUSH');
      if (handler) {
        const ctx: EffectContext = {
          state: newState,
          sourcePlayer: player,
          sourceCard: character,
          sourceMissionIndex: missionIndex,
          triggerType: 'AMBUSH',
          isUpgrade: false,
        };
        const result = handler(ctx);
        newState = result.state;
      }
    }

    return newState;
  }

  /**
   * Resolve SCORE effects when a mission is won.
   */
  static resolveScoreEffects(
    state: GameState,
    player: PlayerID,
    missionIndex: number,
  ): GameState {
    let newState = deepClone(state);
    const mission = newState.activeMissions[missionIndex];

    // Mission card SCORE effects — call handler once per mission card
    const hasMissionScore = (mission.card.effects ?? []).some((e) => e.type === 'SCORE');
    if (hasMissionScore) {
      const handler = getEffectHandler(mission.card.id, 'SCORE');
      if (handler) {
        const ctx: EffectContext = {
          state: newState,
          sourcePlayer: player,
          sourceCard: null as unknown as CharacterInPlay, // Mission card, no character
          sourceMissionIndex: missionIndex,
          triggerType: 'SCORE',
          isUpgrade: false,
        };
        const result = handler(ctx);
        newState = result.state;
      }
    }

    // Winner's character SCORE effects — call handler once per character
    const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    for (const char of chars) {
      if (char.isHidden) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      const hasCharScore = (topCard.effects ?? []).some((e) => e.type === 'SCORE');
      if (hasCharScore) {
        const handler = getEffectHandler(topCard.id, 'SCORE');
        if (handler) {
          const ctx: EffectContext = {
            state: newState,
            sourcePlayer: player,
            sourceCard: char,
            sourceMissionIndex: missionIndex,
            triggerType: 'SCORE',
            isUpgrade: false,
          };
          const result = handler(ctx);
          newState = result.state;
        }
      }
    }

    return newState;
  }

  /**
   * Check if a defeat should be replaced by another action (e.g., Hayate hides instead).
   */
  static checkDefeatReplacement(
    state: GameState,
    targetChar: CharacterInPlay,
    targetPlayer: PlayerID,
    missionIndex: number,
    isEnemyEffect: boolean,
  ): { replaced: boolean; replacement: 'hide' | 'sacrifice'; sacrificeInstanceId?: string } {
    if (targetChar.isHidden) {
      return { replaced: false, replacement: 'hide' };
    }

    const topCard = targetChar.stack.length > 0 ? targetChar.stack[targetChar.stack.length - 1] : targetChar.card;

    // Hayate 048: If this character would be defeated, hide it instead
    if (topCard.number === 48) {
      const hasReplacement = (topCard.effects ?? []).some(
        (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('defeated') && e.description.includes('hide'),
      );
      if (hasReplacement) {
        return { replaced: true, replacement: 'hide' };
      }
    }

    // Gaara 075: If this character would be moved or defeated by enemy effects, hide instead
    if (topCard.number === 75 && isEnemyEffect) {
      const hasReplacement = (topCard.effects ?? []).some(
        (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('defeated by enemy') && e.description.includes('hide'),
      );
      if (hasReplacement) {
        return { replaced: true, replacement: 'hide' };
      }
    }

    // Gemma 049: If friendly Leaf Village in this mission would be hidden/defeated by enemy effects,
    // can defeat this character instead (sacrifice)
    if (isEnemyEffect) {
      const mission = state.activeMissions[missionIndex];
      const friendlyChars = targetPlayer === 'player1' ? mission.player1Characters : mission.player2Characters;

      for (const friendly of friendlyChars) {
        if (friendly.isHidden || friendly.instanceId === targetChar.instanceId) continue;
        const fTopCard = friendly.stack.length > 0 ? friendly.stack[friendly.stack.length - 1] : friendly.card;

        if (fTopCard.number === 49) {
          const hasSacrifice = (fTopCard.effects ?? []).some(
            (e) =>
              e.type === 'MAIN' &&
              e.description.includes('[⧗]') &&
              e.description.includes('Leaf Village') &&
              e.description.includes('defeat this character instead'),
          );
          if (hasSacrifice && targetChar.card.group === 'Leaf Village') {
            return { replaced: true, replacement: 'sacrifice', sacrificeInstanceId: friendly.instanceId };
          }
        }
      }
    }

    return { replaced: false, replacement: 'hide' };
  }
}
