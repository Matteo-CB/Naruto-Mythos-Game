import type { GameState, PlayerID, CharacterInPlay } from '../types';
import { logSystem, logAction } from '../utils/gameLog';
import { shouldRetainPowerTokens } from '../../effects/ContinuousEffects';

/**
 * Execute the End Phase:
 * 1. Discard all remaining chakra from both players' pools to 0
 * 2. Remove ALL Power tokens from all characters in play
 * 3. Handle end-of-round triggers (Summon returns, Akamaru check)
 * 4. Rock Lee exception: keeps power tokens
 */
export function executeEndPhase(state: GameState): GameState {
  let newState = { ...state };

  // 1. Reset chakra to 0
  newState.player1 = { ...newState.player1, chakra: 0 };
  newState.player2 = { ...newState.player2, chakra: 0 };

  newState.log = logSystem(
    newState.log,
    state.turn,
    'end',
    'RESET_CHAKRA',
    'Both players\' chakra pools reset to 0.',
    'game.log.resetChakra',
  );

  // 2. Remove power tokens (with Rock Lee exception)
  newState = removeAllPowerTokens(newState);

  // 3. Handle end-of-round triggers
  newState = handleEndOfRoundTriggers(newState);

  return newState;
}

/**
 * Remove ALL power tokens from all characters in play.
 * Exception: Rock Lee 039 - doesn't lose Power tokens if [hourglass] continuous is active.
 * Delegates retention check to centralized ContinuousEffects module.
 */
function removeAllPowerTokens(state: GameState): GameState {
  const missions = state.activeMissions.map((mission) => {
    const processChars = (chars: CharacterInPlay[]): CharacterInPlay[] => {
      return chars.map((char) => {
        // Check centralized retention logic (Rock Lee 039 exception)
        if (shouldRetainPowerTokens(char)) {
          return char; // Keep tokens
        }

        if (char.powerTokens > 0) {
          return { ...char, powerTokens: 0 };
        }
        return char;
      });
    };

    return {
      ...mission,
      player1Characters: processChars(mission.player1Characters),
      player2Characters: processChars(mission.player2Characters),
    };
  });

  return {
    ...state,
    activeMissions: missions,
    log: logSystem(state.log, state.turn, 'end', 'REMOVE_TOKENS',
      'All Power tokens removed (exceptions applied).',
      'game.log.removeTokens',
    ),
  };
}

/**
 * Handle end-of-round triggers:
 * - Summon characters return to hand (Gama Bunta, Gamahiro, Gamakichi, Gamatatsu, Katsuyu)
 * - Akamaru check: if no Kiba in same mission, return to hand
 */
function handleEndOfRoundTriggers(state: GameState): GameState {
  let newState = { ...state };
  const charsToReturn: { instanceId: string; player: PlayerID; reason: string; cardName: string; isAkamaru: boolean }[] = [];

  for (const mission of newState.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
      const chars = mission[side];

      for (const char of chars) {
        if (char.isHidden) continue;

        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;

        for (const effect of topCard.effects ?? []) {
          if (effect.type !== 'MAIN' || !effect.description.includes('[⧗]')) continue;

          // Summon return: "At the end of the round, you must return this character to your hand"
          if (effect.description.includes('end of the round') && effect.description.includes('return this character')) {
            charsToReturn.push({
              instanceId: char.instanceId,
              player: char.controlledBy,
              reason: `${topCard.name_fr} (Summon) returns to hand at end of round.`,
              cardName: topCard.name_fr,
              isAkamaru: false,
            });
          }

          // Akamaru 027: If no Kiba in this mission, return to hand
          if (topCard.number === 27 && effect.description.includes('Kiba Inuzuka')) {
            const hasKiba = chars.some(
              (c) => {
                if (c.instanceId === char.instanceId || c.isHidden) return false;
                const cTop = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
                return cTop.name_fr.toUpperCase().includes('KIBA');
              },
            );
            if (!hasKiba) {
              charsToReturn.push({
                instanceId: char.instanceId,
                player: char.controlledBy,
                reason: 'Akamaru returns to hand (no Kiba in mission).',
                cardName: topCard.name_fr,
                isAkamaru: true,
              });
            }
          }
        }
      }
    }
  }

  // Process returns
  for (const toReturn of charsToReturn) {
    newState = returnCharacterToHand(newState, toReturn.instanceId, toReturn.player);
    newState.log = logAction(
      newState.log,
      state.turn,
      'end',
      toReturn.player,
      'END_RETURN',
      toReturn.reason,
      toReturn.isAkamaru ? 'game.log.effect.akamaru' : 'game.log.effect.endReturn',
      toReturn.isAkamaru ? undefined : { card: toReturn.cardName },
    );
  }

  // Rock Lee 117 (R): At end of round, must move to another mission, if able
  newState = handleRockLee117Move(newState);

  return newState;
}

/**
 * Rock Lee 117 (R) / 151 (M): At end of round, must move to another mission, if able.
 * If there's exactly 1 valid destination, auto-move. If multiple destinations,
 * create a pending action so the player can choose.
 *
 * @param processedIds Set of instanceIds already processed this end phase (to prevent re-processing)
 */
export function handleRockLee117Move(
  state: GameState,
  processedIds?: Set<string>,
): GameState {
  let newState = { ...state };
  const processed = processedIds ?? new Set<string>();

  for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
    const mission = newState.activeMissions[mIdx];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
      const chars = mission[side];

      for (const char of chars) {
        if (processed.has(char.instanceId)) continue;
        if (char.isHidden) continue;
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        // Rock Lee 117 (R) and 151 (M) both have the continuous move effect
        if (topCard.number !== 117 && topCard.number !== 151) continue;

        const hasMove = (topCard.effects ?? []).some(
          (e) => e.type === 'MAIN' && e.description.includes('[⧗]') &&
            (e.description.includes('move this character') || e.description.includes('must move')),
        );
        if (!hasMove) continue;

        // Find ALL valid destinations (any other mission, respecting name uniqueness)
        const validDests: number[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          if (i === mIdx) continue;
          const destMission = newState.activeMissions[i];
          const destChars = player === 'player1' ? destMission.player1Characters : destMission.player2Characters;
          const hasSameName = destChars.some(
            (c) => !c.isHidden && (c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card)
              .name_fr.toUpperCase() === topCard.name_fr.toUpperCase(),
          );
          if (!hasSameName) {
            validDests.push(i);
          }
        }

        if (validDests.length === 0) continue; // No valid destination — "if able" clause

        if (validDests.length === 1) {
          // Auto-move: only 1 valid destination
          const destIdx = validDests[0];
          const missions = [...newState.activeMissions];
          const srcMission = { ...missions[mIdx] };
          const destMission = { ...missions[destIdx] };

          srcMission[side] = srcMission[side].filter((c: CharacterInPlay) => c.instanceId !== char.instanceId);
          const movedChar = { ...char, missionIndex: destIdx };
          destMission[side] = [...destMission[side], movedChar];

          missions[mIdx] = srcMission;
          missions[destIdx] = destMission;
          newState.activeMissions = missions;

          newState.log = logAction(
            newState.log, state.turn, 'end', player,
            'EFFECT_MOVE',
            `Rock Lee (${topCard.number}): Moves to mission ${destIdx + 1} at end of round.`,
            'game.log.effect.endMove',
            { card: 'ROCK LEE', id: topCard.id },
          );
          processed.add(char.instanceId);
          break; // Break inner loop to avoid mutation issues, outer loop continues
        }

        // Multiple destinations: let the player choose
        const effectId = `rl117-endmove-${char.instanceId}`;
        const actionId = `rl117-endmove-action-${char.instanceId}`;
        newState.pendingEffects = [...newState.pendingEffects, {
          id: effectId,
          sourceCardId: topCard.id,
          sourceInstanceId: char.instanceId,
          sourceMissionIndex: mIdx,
          effectType: 'MAIN' as const,
          effectDescription: `Rock Lee (${topCard.number}): Must move to another mission.`,
          targetSelectionType: 'ROCK_LEE_END_MOVE',
          sourcePlayer: player,
          requiresTargetSelection: true,
          validTargets: validDests.map(String),
          isOptional: false,
          isMandatory: true,
          resolved: false,
          isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: actionId,
          type: 'SELECT_TARGET',
          player,
          description: `Rock Lee (${topCard.number}): Choose a mission to move to at end of round.`,
          options: validDests.map(String),
          minSelections: 1,
          maxSelections: 1,
          sourceEffectId: effectId,
        }];
        // Return immediately — wait for player to choose
        return newState;
      }
    }
  }

  return newState;
}

/**
 * Remove a character from play and return to owner's hand.
 */
function returnCharacterToHand(state: GameState, instanceId: string, player: PlayerID): GameState {
  const newState = { ...state };
  const missions = [...newState.activeMissions];

  for (let i = 0; i < missions.length; i++) {
    const mission = { ...missions[i] };

    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const chars = [...mission[side]];
      const idx = chars.findIndex((c) => c.instanceId === instanceId);
      if (idx !== -1) {
        const char = chars[idx];
        chars.splice(idx, 1);
        mission[side] = chars;
        missions[i] = mission;

        // Return top card to original owner's hand
        const owner = char.originalOwner;
        const ps = { ...newState[owner] };
        const returnCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        ps.hand = [...ps.hand, returnCard];
        ps.charactersInPlay = Math.max(0, ps.charactersInPlay - 1);
        newState[owner] = ps;

        newState.activeMissions = missions;
        return newState;
      }
    }
  }

  newState.activeMissions = missions;
  return newState;
}
