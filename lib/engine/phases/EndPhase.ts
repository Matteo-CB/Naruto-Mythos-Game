import type { GameState, PlayerID, CharacterInPlay } from '../types';
import { logSystem, logAction } from '../utils/gameLog';
import { shouldRetainPowerTokens, isMovementBlockedByKurenai } from '../../effects/ContinuousEffects';

// ---------------------
// End-of-round effect ordering
// ---------------------

interface EndOfRoundEffectInfo {
  instanceId: string;
  type: 'GIANT_SPIDER_103' | 'ROCK_LEE_117' | 'AKAMARU_028';
  player: PlayerID;
  missionIndex: number;
  cardId: string;
  cardName: string;
  cardImage?: string;
}

/**
 * Scan for ALL interactive end-of-round effects (presence check only, not validity).
 * Used to detect when 2+ effects from different source cards exist, requiring player ordering.
 */
export function scanEndOfRoundInteractiveEffects(state: GameState): EndOfRoundEffectInfo[] {
  const effects: EndOfRoundEffectInfo[] = [];
  const processedGS = new Set<string>(state.endPhaseGiantSpider103Ids ?? []);
  const processedRL = new Set<string>(state.endPhaseMovedIds ?? []);
  const processedAK = new Set<string>(state.endPhaseAkamaru028Ids ?? []);

  for (let mIdx = 0; mIdx < state.activeMissions.length; mIdx++) {
    const mission = state.activeMissions[mIdx];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
      for (const char of mission[side]) {
        if (char.isHidden) continue;
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;

        // Giant Spider 103
        if (topCard.number === 103 && !processedGS.has(char.instanceId)) {
          const hasEffect = (topCard.effects ?? []).some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]') &&
              e.description.toLowerCase().includes('hide a character'),
          );
          if (hasEffect) {
            effects.push({
              instanceId: char.instanceId, type: 'GIANT_SPIDER_103', player,
              missionIndex: mIdx, cardId: topCard.id, cardName: topCard.name_fr,
              cardImage: topCard.image_file,
            });
          }
        }

        // Rock Lee 117 / 151
        if ((topCard.number === 117 || topCard.number === 151) && !processedRL.has(char.instanceId)) {
          const hasEffect = (topCard.effects ?? []).some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]') &&
              (e.description.includes('move this character') || e.description.includes('must move')),
          );
          if (hasEffect) {
            effects.push({
              instanceId: char.instanceId, type: 'ROCK_LEE_117', player,
              missionIndex: mIdx, cardId: topCard.id, cardName: topCard.name_fr,
              cardImage: topCard.image_file,
            });
          }
        }

        // Akamaru 028
        if (topCard.number === 28 && !processedAK.has(char.instanceId)) {
          const hasEffect = (topCard.effects ?? []).some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]'),
          );
          if (hasEffect) {
            effects.push({
              instanceId: char.instanceId, type: 'AKAMARU_028', player,
              missionIndex: mIdx, cardId: topCard.id, cardName: topCard.name_fr,
              cardImage: topCard.image_file,
            });
          }
        }
      }
    }
  }

  return effects;
}

/**
 * Create an END_OF_ROUND_EFFECT_ORDER pending action for the player to choose ordering.
 * Used when 2+ interactive end-of-round effects from different source cards exist.
 */
export function createEndOfRoundOrderChoice(state: GameState, effects: EndOfRoundEffectInfo[]): GameState {
  let newState = { ...state };
  const player = effects[0].player;
  const effectId = `end-round-order-${effects.map((e) => e.instanceId).join('-')}`;
  const actionId = `end-round-order-action-${effects.map((e) => e.instanceId).join('-')}`;

  newState.pendingEffects = [...newState.pendingEffects, {
    id: effectId,
    sourceCardId: effects[0].cardId,
    sourceInstanceId: effects[0].instanceId,
    sourceMissionIndex: effects[0].missionIndex,
    effectType: 'MAIN' as const,
    effectDescription: JSON.stringify(effects.map((e) => ({
      instanceId: e.instanceId, type: e.type, cardName: e.cardName,
      cardImage: e.cardImage, cardId: e.cardId,
    }))),
    targetSelectionType: 'END_OF_ROUND_EFFECT_ORDER',
    sourcePlayer: player,
    requiresTargetSelection: true,
    validTargets: effects.map((e) => e.instanceId),
    isOptional: false,
    isMandatory: true,
    resolved: false,
    isUpgrade: false,
  }];

  newState.pendingActions = [...newState.pendingActions, {
    id: actionId,
    type: 'SELECT_TARGET' as const,
    player,
    description: 'Choose which end-of-round effect to resolve first.',
    descriptionKey: 'game.effect.desc.endOfRoundEffectOrder',
    options: effects.map((e) => e.instanceId),
    minSelections: 1,
    maxSelections: 1,
    sourceEffectId: effectId,
  }];

  return newState;
}

/**
 * Process a single chosen end-of-round effect by instanceId.
 * Called after the player selects which effect to resolve first in the ordering UI.
 */
export function processChosenEndOfRoundEffect(state: GameState, chosenInstanceId: string): GameState {
  let newState = { ...state };

  for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
    const mission = newState.activeMissions[mIdx];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
      for (const char of mission[side]) {
        if (char.instanceId !== chosenInstanceId) continue;
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;

        if (topCard.number === 103) {
          return handleGiantSpider103EndOfRound(newState, chosenInstanceId);
        }
        if (topCard.number === 117 || topCard.number === 151) {
          newState = handleRockLee117Move(newState, chosenInstanceId);
          // If no pending created (blocked/no destinations), mark processed + log
          const movedIds = new Set<string>(newState.endPhaseMovedIds ?? []);
          if (!movedIds.has(chosenInstanceId)) {
            movedIds.add(chosenInstanceId);
            newState.endPhaseMovedIds = [...movedIds];
            newState.log = logAction(
              newState.log, newState.turn, 'end', player,
              'EFFECT_BLOCKED',
              `Rock Lee (${topCard.number}): Cannot move at end of round (blocked or no valid destination).`,
              'game.log.effect.rockLeeBlocked',
              { card: topCard.name_fr, id: topCard.id },
            );
          }
          return newState;
        }
        if (topCard.number === 28) {
          return handleAkamaru028Return(newState, chosenInstanceId);
        }
      }
    }
  }

  return newState;
}

/**
 * Process remaining end-of-round effects after one has been resolved.
 * If 2+ still remain from different sources, creates another ordering choice.
 * Otherwise processes remaining in default order.
 */
export function processRemainingEndOfRoundEffects(state: GameState): GameState {
  let newState = { ...state };

  const remaining = scanEndOfRoundInteractiveEffects(newState);

  // Group by player — check if any player has 2+ effects from different sources
  const byPlayer = new Map<PlayerID, EndOfRoundEffectInfo[]>();
  for (const e of remaining) {
    if (!byPlayer.has(e.player)) byPlayer.set(e.player, []);
    byPlayer.get(e.player)!.push(e);
  }

  for (const [, playerEffects] of byPlayer) {
    if (playerEffects.length >= 2) {
      return createEndOfRoundOrderChoice(newState, playerEffects);
    }
  }

  // 0 or 1 remaining — process in default order
  newState = handleGiantSpider103EndOfRound(newState);
  if (newState.pendingActions.length > 0) return newState;

  newState = handleRockLee117Move(newState);
  if (newState.pendingActions.length > 0) return newState;

  newState = handleAkamaru028Return(newState);
  return newState;
}

/**
 * Finalize end phase: remove tokens (if not yet done), run automatic triggers.
 */
export function finalizeEndPhase(state: GameState): GameState {
  let newState = { ...state };

  if (!newState.endPhaseTokensRemoved) {
    newState = removeAllPowerTokens(newState);
    newState.endPhaseTokensRemoved = true;
  }

  // Run automatic end-of-round triggers (Summon returns, Akamaru 027, Kimimaro 123)
  newState = handleEndOfRoundAutoTriggers(newState);

  return newState;
}

/**
 * Execute the End Phase:
 * 1. Discard all remaining chakra from both players' pools to 0
 * 2. Scan for interactive end-of-round effects (Giant Spider 103, Rock Lee 117, Akamaru 028)
 * 3. If 2+ effects from different sources: create ordering choice for the player
 * 4. Otherwise: process in default order (Giant Spider → tokens → Rock Lee → Akamaru)
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

  // 2. Scan for interactive end-of-round effects
  const interactiveEffects = scanEndOfRoundInteractiveEffects(newState);

  // 3. Group by player — check if any player has 2+ effects from different sources
  const byPlayer = new Map<PlayerID, EndOfRoundEffectInfo[]>();
  for (const e of interactiveEffects) {
    if (!byPlayer.has(e.player)) byPlayer.set(e.player, []);
    byPlayer.get(e.player)!.push(e);
  }

  for (const [, playerEffects] of byPlayer) {
    if (playerEffects.length >= 2) {
      // Create ordering choice — tokens NOT removed yet (Giant Spider needs them)
      return createEndOfRoundOrderChoice(newState, playerEffects);
    }
  }

  // 4. No multi-effect ordering needed — process in default order
  // Giant Spider BEFORE token removal (needs tokens for power threshold)
  newState = handleGiantSpider103EndOfRound(newState);
  if (newState.pendingActions.length > 0) return newState;

  // Remove tokens
  newState = removeAllPowerTokens(newState);
  newState.endPhaseTokensRemoved = true;

  // Automatic triggers (Summon returns, Akamaru 027, Kimimaro 123)
  newState = handleEndOfRoundAutoTriggers(newState);

  // Rock Lee + Akamaru 028 (after token removal)
  newState = handleRockLee117Move(newState);
  if (newState.pendingActions.length > 0) return newState;

  newState = handleAkamaru028Return(newState);
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
  let newState = handleEndOfRoundAutoTriggers(state);

  // Rock Lee 117 (R): At end of round, must move to another mission, if able
  newState = handleRockLee117Move(newState);

  return newState;
}

/**
 * Automatic end-of-round triggers only (non-interactive).
 * Summon returns, Akamaru 027, Kimimaro 123 self-defeat.
 * Separated from handleEndOfRoundTriggers so it can be called independently
 * when end-of-round effect ordering is active.
 */
function handleEndOfRoundAutoTriggers(state: GameState): GameState {
  let newState = { ...state };
  const charsToReturn: { instanceId: string; player: PlayerID; reason: string; cardName: string; isAkamaru: boolean }[] = [];
  const returnQueued = new Set<string>();

  for (const mission of newState.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
      const chars = mission[side];

      for (const char of chars) {
        if (char.isHidden) continue;
        if (returnQueued.has(char.instanceId)) continue;

        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        const isSummon = (topCard.keywords ?? []).includes('Summon');

        // --- Summon keyword return ---
        if (isSummon) {
          const isGiantSpider103 = (topCard.effects ?? []).some(
            (e) => e.type === 'MAIN' && e.description.includes('[⧗]') &&
              e.description.toLowerCase().includes('hide a character'),
          );
          if (!isGiantSpider103) {
            console.log(`[EndPhase] Summon return queued: ${topCard.name_fr} (${topCard.id}) instanceId=${char.instanceId} hidden=${char.isHidden} controlledBy=${char.controlledBy}`);
            charsToReturn.push({
              instanceId: char.instanceId,
              player: char.controlledBy,
              reason: `${topCard.name_fr} (Summon) returns to hand at end of round.`,
              cardName: topCard.name_fr,
              isAkamaru: false,
            });
            returnQueued.add(char.instanceId);
          }
          continue;
        }

        // --- Akamaru 027: Conditional return if no friendly Kiba in mission ---
        const hasAkamaruReturn = (topCard.effects ?? []).some(
          (e) => e.type === 'MAIN' &&
            e.description.includes('[⧗]') &&
            e.description.includes('Kiba Inuzuka') &&
            e.description.toLowerCase().includes('end of the round') &&
            e.description.toLowerCase().includes('return'),
        );
        if (hasAkamaruReturn) {
          const allMissionChars = [...mission.player1Characters, ...mission.player2Characters];
          const hasKiba = allMissionChars.some(
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
            returnQueued.add(char.instanceId);
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

  // Kimimaro 123 (R): At end of round, defeat self if controlling player has no cards in hand
  newState = handleKimimaro123SelfDefeat(newState);

  return newState;
}

/**
 * Kimimaro 123 (R) / 123 (RA): [⧗] At end of round, defeat this character
 * if the controlling player has no cards in hand.
 */
function handleKimimaro123SelfDefeat(state: GameState): GameState {
  let newState = { ...state };

  for (let mi = 0; mi < newState.activeMissions.length; mi++) {
    const mission = newState.activeMissions[mi];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
      const chars = mission[side];

      for (const char of chars) {
        if (char.isHidden) continue;
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        if (topCard.number !== 123) continue;

        // Card 123 always has the continuous self-defeat effect.
        // We already confirmed topCard.number === 123 above.

        // Check if controlling player has no cards in hand
        const controller = char.controlledBy ?? player;
        if (newState[controller].hand.length > 0) continue;

        // Defeat this character: discard entire stack to original owner
        const owner = char.originalOwner ?? controller;
        const missions = [...newState.activeMissions];
        const m = { ...missions[mi] };
        m[side] = m[side].filter((c) => c.instanceId !== char.instanceId);
        missions[mi] = m;
        newState.activeMissions = missions;

        const ownerPs = { ...newState[owner] };
        ownerPs.discardPile = [...ownerPs.discardPile, ...char.stack];
        // Update character count
        let count = 0;
        for (const mm of missions) {
          count += (owner === 'player1' ? mm.player1Characters : mm.player2Characters).length;
        }
        ownerPs.charactersInPlay = count;
        newState[owner] = ownerPs;

        newState.log = logAction(
          newState.log, state.turn, 'end', controller,
          'END_SELF_DEFEAT',
          `Kimimaro (123): Defeated at end of round (no cards in hand).`,
          'game.log.effect.kimimaro123SelfDefeat',
          { card: 'KIMIMARO', id: `KS-123-R` },
        );
      }
    }
  }

  return newState;
}

/**
 * Rock Lee 117 (R) / 151 (M): At end of round, must move to another mission, if able.
 * If there's exactly 1 valid destination, auto-move. If multiple destinations,
 * create a pending action so the player can choose.
 *
 * Uses state.endPhaseMovedIds to track which Rock Lees have already been moved
 * this End Phase, preventing infinite re-processing across multiple calls.
 *
 * @param targetInstanceId - If provided, only process this specific instance (for ordered resolution).
 */
export function handleRockLee117Move(
  state: GameState,
  targetInstanceId?: string,
): GameState {
  let newState = { ...state };
  const alreadyMoved = new Set<string>(newState.endPhaseMovedIds ?? []);

  for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
    const mission = newState.activeMissions[mIdx];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
      const chars = mission[side];

      for (const char of chars) {
        if (targetInstanceId && char.instanceId !== targetInstanceId) continue;
        if (alreadyMoved.has(char.instanceId)) continue;
        if (char.isHidden) continue;
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        // Rock Lee 117 (R) and 151 (M) both have the continuous move effect
        if (topCard.number !== 117 && topCard.number !== 151) continue;

        const hasMove = (topCard.effects ?? []).some(
          (e) => e.type === 'MAIN' && e.description.includes('[⧗]') &&
            (e.description.includes('move this character') || e.description.includes('must move')),
        );
        if (!hasMove) continue;

        // Kurenai 035: enemy characters cannot move from this mission
        if (isMovementBlockedByKurenai(newState, mIdx, player)) continue;

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

        if (validDests.length === 0) continue; // No valid destination - "if able" clause

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
          alreadyMoved.add(char.instanceId);
          newState.endPhaseMovedIds = [...alreadyMoved];
          break; // Break inner loop to avoid mutation issues, outer loop continues
        }

        // Multiple destinations: let the player choose
        alreadyMoved.add(char.instanceId);
        newState.endPhaseMovedIds = [...alreadyMoved];
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
          descriptionKey: 'game.effect.desc.rockLeeEndMove',
          options: validDests.map(String),
          minSelections: 1,
          maxSelections: 1,
          sourceEffectId: effectId,
        }];
        // Return immediately - wait for player to choose
        return newState;
      }
    }
  }

  return newState;
}

/**
 * Akamaru 028 (UC): At end of round, the player may OPTIONALLY return this card to their hand.
 * Creates pending actions for each Akamaru 028 in play (non-hidden).
 * Uses state.endPhaseAkamaru028Ids to track which have been processed.
 *
 * @param targetInstanceId - If provided, only process this specific instance (for ordered resolution).
 */
export function handleAkamaru028Return(state: GameState, targetInstanceId?: string): GameState {
  let newState = { ...state };
  const alreadyProcessed = new Set<string>(newState.endPhaseAkamaru028Ids ?? []);

  for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
    const mission = newState.activeMissions[mIdx];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
      const chars = mission[side];

      for (const char of chars) {
        if (targetInstanceId && char.instanceId !== targetInstanceId) continue;
        if (alreadyProcessed.has(char.instanceId)) continue;
        if (char.isHidden) continue;
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        if (topCard.number !== 28) continue;

        // Check for the continuous end-of-round return effect
        const hasReturnEffect = (topCard.effects ?? []).some(
          (e) => e.type === 'MAIN' && e.description.includes('[⧗]'),
        );
        if (!hasReturnEffect) continue;

        alreadyProcessed.add(char.instanceId);
        newState.endPhaseAkamaru028Ids = [...alreadyProcessed];

        const effectId = `akamaru028-return-${char.instanceId}`;
        const actionId = `akamaru028-return-action-${char.instanceId}`;
        newState.pendingEffects = [...newState.pendingEffects, {
          id: effectId,
          sourceCardId: topCard.id,
          sourceInstanceId: char.instanceId,
          sourceMissionIndex: mIdx,
          effectType: 'MAIN' as const,
          effectDescription: `Akamaru (028): You may return this character to your hand.`,
          targetSelectionType: 'AKAMARU028_RETURN_TO_HAND',
          sourcePlayer: player,
          requiresTargetSelection: true,
          validTargets: [char.instanceId],
          isOptional: true,
          isMandatory: false,
          resolved: false,
          isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: actionId,
          type: 'SELECT_TARGET',
          player,
          description: `Akamaru (028): Return this character to your hand?`,
          descriptionKey: 'game.effect.desc.akamaru028ReturnToHand',
          options: [char.instanceId],
          minSelections: 1,
          maxSelections: 1,
          sourceEffectId: effectId,
        }];
        // Return immediately - wait for player to choose (or decline)
        return newState;
      }
    }
  }

  return newState;
}

/**
 * Giant Spider 103 (UC): [⧗] At end of round, player may hide a character with Power ≤ Giant Spider's power.
 * Giant Spider always returns to hand. If it hides itself, it does NOT return (continuous effect gone).
 * Uses state.endPhaseGiantSpider103Ids to avoid processing the same card twice across resumptions.
 *
 * @param targetInstanceId - If provided, only process this specific instance (for ordered resolution).
 */
export function handleGiantSpider103EndOfRound(state: GameState, targetInstanceId?: string): GameState {
  let newState = { ...state };
  const alreadyProcessed = new Set<string>(newState.endPhaseGiantSpider103Ids ?? []);

  for (let mIdx = 0; mIdx < newState.activeMissions.length; mIdx++) {
    const mission = newState.activeMissions[mIdx];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
      const chars = mission[side];

      for (const char of chars) {
        if (targetInstanceId && char.instanceId !== targetInstanceId) continue;
        if (alreadyProcessed.has(char.instanceId)) continue;
        if (char.isHidden) continue;
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        if (topCard.number !== 103) continue;

        // Include power tokens in threshold (Giant Spider runs before token removal now)
        const powerThreshold = (topCard.power ?? 4) + char.powerTokens;

        // Find all non-hidden characters with effective power ≤ threshold
        const validTargets: string[] = [];
        for (let mi = 0; mi < newState.activeMissions.length; mi++) {
          const m = newState.activeMissions[mi];
          for (const s of ['player1Characters', 'player2Characters'] as const) {
            for (const c of m[s]) {
              if (c.isHidden) continue;
              const cTop = c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
              if (((cTop.power ?? 0) + c.powerTokens) <= powerThreshold) {
                validTargets.push(c.instanceId);
              }
            }
          }
        }

        alreadyProcessed.add(char.instanceId);
        newState.endPhaseGiantSpider103Ids = [...alreadyProcessed];

        // Giant Spider ALWAYS returns to hand at end of round, regardless of hide
        if (validTargets.length === 0) {
          // No valid hide targets - just return Giant Spider to hand
          newState = returnCharacterToHand(newState, char.instanceId, player);
          newState.log = logAction(
            newState.log, newState.turn, 'end', player,
            'END_RETURN_TO_HAND',
            'Giant Spider (103): Returns to hand at end of round.',
            'game.log.effect.giantSpider103Return',
            { card: 'ARAIGNEE GEANTE', id: 'KS-103-UC' },
          );
          // Re-run to check for more Giant Spiders
          return handleGiantSpider103EndOfRound(newState);
        }

        const effectId = `giantSpider103-hide-${char.instanceId}`;
        const actionId = `giantSpider103-hide-action-${char.instanceId}`;
        newState.pendingEffects = [...newState.pendingEffects, {
          id: effectId,
          sourceCardId: topCard.id,
          sourceInstanceId: char.instanceId,
          sourceMissionIndex: mIdx,
          effectType: 'MAIN' as const,
          effectDescription: JSON.stringify({ giantSpiderInstanceId: char.instanceId }),
          targetSelectionType: 'GIANT_SPIDER103_CHOOSE_HIDE_TARGET',
          sourcePlayer: player,
          requiresTargetSelection: true,
          validTargets,
          isOptional: true,
          isMandatory: false,
          resolved: false,
          isUpgrade: false,
        }];
        newState.pendingActions = [...newState.pendingActions, {
          id: actionId,
          type: 'SELECT_TARGET' as const,
          player,
          description: `Giant Spider (103): You may hide a character with Power ≤ ${powerThreshold}. If you do, Giant Spider must return to your hand.`,
          descriptionKey: 'game.effect.desc.giantSpider103EndHide',
          options: validTargets,
          minSelections: 1,
          maxSelections: 1,
          sourceEffectId: effectId,
        }];
        // Return immediately - wait for player to choose (or decline)
        return newState;
      }
    }
  }

  return newState;
}

/**
 * Remove a character from play and return to owner's hand.
 */
export function returnCharacterToHand(state: GameState, instanceId: string, player: PlayerID): GameState {
  const newState = { ...state };
  const missions = [...newState.activeMissions];

  for (let i = 0; i < missions.length; i++) {
    const mission = { ...missions[i] };

    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const chars = [...mission[side]];
      const idx = chars.findIndex((c) => c.instanceId === instanceId);
      if (idx !== -1) {
        const char = chars[idx];
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        console.log(`[returnCharacterToHand] Returning ${topCard.name_fr} (${topCard.id}) instanceId=${instanceId} hidden=${char.isHidden} mission=${i} side=${side}`);
        chars.splice(idx, 1);
        mission[side] = chars;
        missions[i] = mission;

        // Return entire stack to original owner's hand
        const owner = char.originalOwner;
        const ps = { ...newState[owner] };
        const allCards = char.stack.length > 0 ? [...char.stack] : [char.card];
        ps.hand = [...ps.hand, ...allCards];
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
