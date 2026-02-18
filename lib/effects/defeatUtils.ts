import type { GameState, PlayerID, CharacterInPlay } from '../engine/types';
import { logAction } from '../engine/utils/gameLog';
import { EffectEngine } from './EffectEngine';

/**
 * Centralized defeat utility.
 *
 * Every handler that defeats a character MUST use this function instead of
 * inline splice-and-discard. It enforces:
 *
 * 1. Defeat replacement checks (Hayate 048, Gaara 075, Gemma 049)
 * 2. On-defeat triggers (Tsunade 003, Sasuke 136)
 */

/**
 * Find a character by instanceId across all missions.
 * Returns the character, the mission index, and which side it's on.
 */
function findCharacterInPlay(
  state: GameState,
  instanceId: string,
): { char: CharacterInPlay; missionIndex: number; side: 'player1Characters' | 'player2Characters' } | null {
  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const idx = mission[side].findIndex((c) => c.instanceId === instanceId);
      if (idx !== -1) {
        return { char: mission[side][idx], missionIndex: i, side };
      }
    }
  }
  return null;
}

/**
 * Defeat a character, respecting replacement effects and triggering on-defeat effects.
 *
 * @param state - Current game state
 * @param missionIndex - Mission where the character is
 * @param charInstanceId - Instance ID of the character to defeat
 * @param side - Which side the character is on ('player1Characters' or 'player2Characters')
 * @param isEnemyEffect - Whether this defeat is caused by an enemy effect (for Hayate/Gaara/Gemma)
 * @param sourcePlayer - The player whose effect is causing the defeat (for logging)
 * @returns Updated game state. The character may have been hidden instead of defeated (replacement).
 */
export function defeatCharacterInPlay(
  state: GameState,
  missionIndex: number,
  charInstanceId: string,
  side: 'player1Characters' | 'player2Characters',
  isEnemyEffect: boolean,
  sourcePlayer: PlayerID,
): GameState {
  const mission = state.activeMissions[missionIndex];
  const chars = mission[side];
  const charIdx = chars.findIndex((c) => c.instanceId === charInstanceId);
  if (charIdx === -1) return state;

  const targetChar = chars[charIdx];
  const targetPlayer: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';

  // 1. Check defeat replacement (Hayate 048, Gaara 075, Gemma 049)
  const replacement = EffectEngine.checkDefeatReplacement(
    state, targetChar, targetPlayer, missionIndex, isEnemyEffect,
  );

  if (replacement.replaced) {
    if (replacement.replacement === 'hide') {
      // Hide instead of defeat (Hayate 048 or Gaara 075)
      const missions = [...state.activeMissions];
      const m = { ...missions[missionIndex] };
      const cs = [...m[side]];
      cs[charIdx] = { ...cs[charIdx], isHidden: true };
      m[side] = cs;
      missions[missionIndex] = m;

      return {
        ...state,
        activeMissions: missions,
        log: logAction(
          state.log,
          state.turn,
          state.phase,
          targetPlayer,
          'EFFECT_REPLACEMENT',
          `${targetChar.card.name_fr} was hidden instead of defeated (replacement effect).`,
        ),
      };
    }

    if (replacement.replacement === 'sacrifice' && replacement.sacrificeInstanceId) {
      // Gemma 049 sacrifices himself to protect the target
      const sacrificeInfo = findCharacterInPlay(state, replacement.sacrificeInstanceId);
      if (sacrificeInfo) {
        // Defeat the sacrifice instead
        let newState = removeCharacterFromPlay(
          state, sacrificeInfo.missionIndex, replacement.sacrificeInstanceId, sacrificeInfo.side,
        );
        newState = {
          ...newState,
          log: logAction(
            newState.log,
            state.turn,
            state.phase,
            targetPlayer,
            'EFFECT_SACRIFICE',
            `Gemma Shiranui sacrificed to protect ${targetChar.card.name_fr}.`,
          ),
        };
        // Trigger on-defeat for the sacrificed character
        newState = triggerOnDefeatEffects(newState, sacrificeInfo.char, targetPlayer);
        return newState;
      }
    }
  }

  // 2. Normal defeat: remove from play, discard
  let newState = removeCharacterFromPlay(state, missionIndex, charInstanceId, side);

  newState = {
    ...newState,
    log: logAction(
      newState.log,
      state.turn,
      state.phase,
      sourcePlayer,
      'EFFECT_DEFEAT',
      `${targetChar.card.name_fr} was defeated.`,
    ),
  };

  // 3. Trigger on-defeat effects (Tsunade 003, Sasuke 136)
  newState = triggerOnDefeatEffects(newState, targetChar, targetPlayer);

  return newState;
}

/**
 * Shorthand: defeat an enemy character. Determines the side automatically.
 */
export function defeatEnemyCharacter(
  state: GameState,
  missionIndex: number,
  charInstanceId: string,
  sourcePlayer: PlayerID,
): GameState {
  const enemySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
  return defeatCharacterInPlay(state, missionIndex, charInstanceId, enemySide, true, sourcePlayer);
}

/**
 * Shorthand: defeat a friendly character (e.g., Sasuke 136 UPGRADE mutual destruction).
 */
export function defeatFriendlyCharacter(
  state: GameState,
  missionIndex: number,
  charInstanceId: string,
  sourcePlayer: PlayerID,
): GameState {
  const friendlySide: 'player1Characters' | 'player2Characters' =
    sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
  return defeatCharacterInPlay(state, missionIndex, charInstanceId, friendlySide, false, sourcePlayer);
}

/**
 * Low-level removal: splice character from mission array, add to discard pile.
 * Does NOT check replacement or trigger on-defeat effects.
 */
function removeCharacterFromPlay(
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

  // Add to original owner's discard pile
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

/**
 * Trigger on-defeat continuous effects.
 *
 * Scans all face-visible characters for:
 * - Tsunade 003: When a friendly character is defeated, gain 2 chakra
 * - Sasuke 136: When any character is defeated, gain 1 chakra
 */
function triggerOnDefeatEffects(
  state: GameState,
  defeatedChar: CharacterInPlay,
  defeatedCharOwner: PlayerID,
): GameState {
  let newState = state;

  for (const mission of newState.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const controllingPlayer: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';

      for (const char of mission[side]) {
        if (char.isHidden) continue;
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;

        // Tsunade 003: When any friendly character is defeated, gain 2 Chakra
        if (topCard.number === 3 && controllingPlayer === defeatedCharOwner) {
          const hasEffect = topCard.effects.some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]'),
          );
          if (hasEffect) {
            const ps = { ...newState[controllingPlayer] };
            ps.chakra += 2;
            newState = {
              ...newState,
              [controllingPlayer]: ps,
              log: logAction(
                newState.log,
                newState.turn,
                newState.phase,
                controllingPlayer,
                'EFFECT_ON_DEFEAT',
                `Tsunade (003): Gained 2 chakra (friendly character ${defeatedChar.card.name_fr} was defeated).`,
              ),
            };
          }
        }

        // Sasuke 136: When ANY character is defeated, gain 1 Chakra
        if (topCard.number === 136) {
          const hasEffect = topCard.effects.some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]'),
          );
          if (hasEffect) {
            const ps = { ...newState[controllingPlayer] };
            ps.chakra += 1;
            newState = {
              ...newState,
              [controllingPlayer]: ps,
              log: logAction(
                newState.log,
                newState.turn,
                newState.phase,
                controllingPlayer,
                'EFFECT_ON_DEFEAT',
                `Sasuke Uchiwa (136): Gained 1 chakra (character ${defeatedChar.card.name_fr} was defeated).`,
              ),
            };
          }
        }
      }
    }
  }

  return newState;
}
