import type { GameState, PlayerID, ActiveMission, MissionScoringProgress, ScoreEffectSource, PendingEffect, PendingAction } from '../types';
import { logSystem, logAction } from '../utils/gameLog';
import { calculateCharacterPower } from './PowerCalculation';
import { generateInstanceId } from '../utils/id';
import { EffectEngine } from '../../effects/EffectEngine';
import { isMovementBlockedByKurenai } from '../../effects/ContinuousEffects';

const RANK_ORDER = ['D', 'C', 'B', 'A'] as const;

/**
 * Execute the Mission Phase:
 * Evaluate missions in rank order D -> C -> B -> A
 * For each mission:
 * 1. Sum total power of each player's characters
 * 2. Higher power wins (ties go to Edge holder)
 * 3. Must have at least 1 power to win
 * 4. Winner gains mission points (base + rank bonus)
 * 5. Trigger SCORE effects
 *
 * If a SCORE effect requires target selection, we save progress and return.
 * resumeMissionScoring() picks up where we left off.
 */
export function executeMissionPhase(state: GameState): GameState {
  let newState: GameState = { ...state, missionScoringProgress: undefined };

  // Score missions by rank order: D, C, B, A
  for (let rankIdx = 0; rankIdx < RANK_ORDER.length; rankIdx++) {
    const rank = RANK_ORDER[rankIdx];
    const missionIdx = newState.activeMissions.findIndex((m) => m.rank === rank);
    if (missionIdx === -1) continue;

    newState = scoreMission(newState, missionIdx, rankIdx);

    // If a SCORE effect created a pending action, stop and wait for resolution
    if (newState.pendingActions.length > 0) {
      return newState;
    }
  }

  return newState;
}

/**
 * Resume mission scoring after a SCORE pending action has been resolved.
 * Continues from where we left off using missionScoringProgress.
 */
export function resumeMissionScoring(state: GameState): GameState {
  let newState = { ...state };
  const progress = newState.missionScoringProgress;

  if (!progress) {
    // No progress saved - nothing to resume
    return newState;
  }

  // Resume SCORE effects for the current mission's remaining characters
  const currentRank = RANK_ORDER[progress.currentRankIndex];
  const missionIdx = newState.activeMissions.findIndex((m) => m.rank === currentRank);

  if (missionIdx !== -1) {
    // Resume character SCORE effects on the current mission
    newState = resolveRemainingScoreEffects(newState, progress.winner, missionIdx, progress);

    if (newState.pendingActions.length > 0) {
      return newState;
    }

    // Handle Orochimaru 051 move for the current mission (if not done yet)
    const mission = newState.activeMissions[missionIdx];
    newState = handleOrochimaru051Move(newState, missionIdx, mission.wonBy ?? null);
  }

  // Clear progress for this mission - continue to remaining missions
  newState = { ...newState, missionScoringProgress: undefined };

  // Continue scoring from the next rank
  for (let rankIdx = progress.currentRankIndex + 1; rankIdx < RANK_ORDER.length; rankIdx++) {
    const rank = RANK_ORDER[rankIdx];
    const nextMissionIdx = newState.activeMissions.findIndex((m) => m.rank === rank);
    if (nextMissionIdx === -1) continue;

    newState = scoreMission(newState, nextMissionIdx, rankIdx);

    if (newState.pendingActions.length > 0) {
      return newState;
    }
  }

  return newState;
}

function scoreMission(state: GameState, missionIndex: number, rankIndex: number): GameState {
  const mission = state.activeMissions[missionIndex];

  // Calculate total power for each player
  const p1Power = calculateMissionPower(state, mission, 'player1');
  const p2Power = calculateMissionPower(state, mission, 'player2');

  let log = logSystem(
    state.log,
    state.turn,
    'mission',
    'SCORE_MISSION',
    `Mission ${missionIndex + 1} (${mission.rank}): "${mission.card.name_fr}" - Player1: ${p1Power} power vs Player2: ${p2Power} power.`,
    'game.log.scoreMission',
    { index: missionIndex + 1, rank: mission.rank, name: mission.card.name_fr, p1Power, p2Power },
  );

  // Determine winner - a player must have at least 1 power to win
  let winner: PlayerID | null = null;

  if (p1Power === 0 && p2Power === 0) {
    // Both have 0 power - neither wins
    winner = null;
    log = logSystem(log, state.turn, 'mission', 'NO_WINNER',
      `Mission ${missionIndex + 1}: Both players have 0 power - no winner.`,
      'game.log.noWinner',
      { index: missionIndex + 1 },
    );
  } else if (p1Power > p2Power) {
    winner = 'player1';
  } else if (p2Power > p1Power) {
    winner = 'player2';
  } else {
    // Non-zero tie - edge holder wins
    winner = state.edgeHolder;
    log = logSystem(log, state.turn, 'mission', 'TIE_BREAK',
      `Tie on mission ${missionIndex + 1}. Edge holder (${state.edgeHolder}) wins.`,
      'game.log.tieBreak',
      { index: missionIndex + 1 },
    );
  }

  const missions = [...state.activeMissions];
  const updatedMission = { ...missions[missionIndex], wonBy: winner };
  missions[missionIndex] = updatedMission;

  let newState = { ...state, activeMissions: missions, log };

  if (winner) {
    const points = mission.basePoints + mission.rankBonus;
    const ps = { ...newState[winner] };
    ps.missionPoints += points;

    log = logAction(
      newState.log,
      state.turn,
      'mission',
      winner,
      'WIN_MISSION',
      `${winner} wins mission ${missionIndex + 1} for ${points} points (${mission.basePoints} base + ${mission.rankBonus} rank bonus). Total: ${ps.missionPoints}.`,
      'game.log.winMission',
      { index: missionIndex + 1, points, base: mission.basePoints, bonus: mission.rankBonus, total: ps.missionPoints },
    );

    newState = { ...newState, [winner]: ps, log };

    // Trigger SCORE effects via EffectEngine
    newState = resolveScoreEffectsWithProgress(newState, winner, missionIndex, rankIndex);

    // If a SCORE effect needs target selection, return with progress saved
    if (newState.pendingActions.length > 0) {
      return newState;
    }
  }

  // Orochimaru 051 (UC): If you lost this mission, move Orochimaru to another mission
  newState = handleOrochimaru051Move(newState, missionIndex, winner);

  return newState;
}

/**
 * Collect all SCORE effect sources for a mission (mission card + winner's characters).
 */
function collectScoreEffectSources(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
): ScoreEffectSource[] {
  const mission = state.activeMissions[missionIndex];
  const sources: ScoreEffectSource[] = [];

  // Mission card SCORE effects
  const hasMissionScore = (mission.card.effects ?? []).some((e) => e.type === 'SCORE');
  if (hasMissionScore) {
    const scoreEffect = (mission.card.effects ?? []).find((e) => e.type === 'SCORE');
    sources.push({
      cardId: mission.card.id,
      instanceId: null,
      label: `${mission.card.name_fr} (Mission) - ${scoreEffect?.description ?? 'SCORE'}`,
    });
  }

  // Winner's character SCORE effects
  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  for (const char of chars) {
    if (char.isHidden) continue;
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    const hasCharScore = (topCard.effects ?? []).some((e) => e.type === 'SCORE');
    if (!hasCharScore) continue;

    const scoreEffect = (topCard.effects ?? []).find((e) => e.type === 'SCORE');
    sources.push({
      cardId: topCard.id,
      instanceId: char.instanceId,
      label: `${topCard.name_fr} - ${scoreEffect?.description ?? 'SCORE'}`,
    });
  }

  return sources;
}

/**
 * Create a CHOOSE_SCORE_ORDER pending action so the player picks which SCORE effect resolves next.
 */
function createScoreOrderChoice(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  rankIndex: number,
  pendingSources: ScoreEffectSource[],
): GameState {
  let newState = { ...state };

  const effectId = generateInstanceId();
  const actionId = generateInstanceId();

  const pendingEffect: PendingEffect = {
    id: effectId,
    sourceCardId: '',
    sourceInstanceId: '',
    sourceMissionIndex: missionIndex,
    effectType: 'SCORE',
    effectDescription: 'Choose which SCORE effect to resolve next.',
    targetSelectionType: 'CHOOSE_SCORE_ORDER',
    sourcePlayer: player,
    requiresTargetSelection: true,
    validTargets: pendingSources.map((s) => s.instanceId ?? `mission::${s.cardId}`),
    isOptional: false,
    isMandatory: true,
    resolved: false,
    isUpgrade: false,
  };

  // Options are encoded as "SCORE::<label>" for the CHOOSE_EFFECT UI
  const pendingAction: PendingAction = {
    id: actionId,
    type: 'CHOOSE_EFFECT',
    player,
    description: 'Choose which SCORE effect to resolve next.',
    descriptionKey: 'game.effect.desc.chooseScoreOrder',
    options: pendingSources.map((s) => `SCORE::${s.label}`),
    minSelections: 1,
    maxSelections: 1,
    sourceEffectId: effectId,
  };

  newState.pendingEffects = [...newState.pendingEffects, pendingEffect];
  newState.pendingActions = [...newState.pendingActions, pendingAction];

  // Save progress with the full list of pending SCORE effects
  newState.missionScoringProgress = {
    currentRankIndex: rankIndex,
    missionCardScoreDone: false,
    processedCharacterIds: [],
    winner: player,
    pendingScoreEffects: pendingSources,
  };

  return newState;
}

/**
 * Resolve SCORE effects for a mission, saving progress when target selection is needed.
 * If multiple SCORE effects exist, the player chooses resolution order.
 */
function resolveScoreEffectsWithProgress(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  rankIndex: number,
): GameState {
  const sources = collectScoreEffectSources(state, player, missionIndex);

  if (sources.length === 0) {
    return state;
  }

  // Single SCORE effect: resolve directly (no choice needed)
  if (sources.length === 1) {
    return resolveSingleScoreEffect(state, player, missionIndex, rankIndex, sources[0]);
  }

  // Multiple SCORE effects: let the player choose the order
  return createScoreOrderChoice(state, player, missionIndex, rankIndex, sources);
}

/**
 * Resolve a single identified SCORE effect source.
 */
function resolveSingleScoreEffect(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  rankIndex: number,
  source: ScoreEffectSource,
): GameState {
  let newState = { ...state };
  const mission = newState.activeMissions[missionIndex];

  // Find the character in play (null for mission card SCORE)
  let character = null;
  if (source.instanceId) {
    const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    character = chars.find((c) => c.instanceId === source.instanceId) ?? null;
  }

  const result = EffectEngine.resolveScoreEffectSingle(newState, player, missionIndex, source.cardId, character);

  if (result.pending) {
    newState = result.state;
    // Mark which effects have been processed
    const processedCharIds: string[] = source.instanceId ? [source.instanceId] : [];
    newState.missionScoringProgress = {
      currentRankIndex: rankIndex,
      missionCardScoreDone: !source.instanceId ? true : (newState.missionScoringProgress?.missionCardScoreDone ?? false),
      processedCharacterIds: processedCharIds,
      winner: player,
      pendingScoreEffects: newState.missionScoringProgress?.pendingScoreEffects,
    };
    return newState;
  }

  newState = result.state;
  return newState;
}

/**
 * Called when the player selects which SCORE effect to resolve next from a CHOOSE_SCORE_ORDER pending.
 * Returns the updated state after resolving the chosen effect (or creating its own pending).
 */
export function resolveChosenScoreEffect(
  state: GameState,
  selectedLabel: string,
): GameState {
  let newState = { ...state };
  const progress = newState.missionScoringProgress;
  if (!progress || !progress.pendingScoreEffects) return state;

  // Remove the CHOOSE_SCORE_ORDER pending effect and action
  newState.pendingEffects = newState.pendingEffects.filter(
    (e) => e.targetSelectionType !== 'CHOOSE_SCORE_ORDER',
  );
  newState.pendingActions = newState.pendingActions.filter(
    (a) => !a.options.some((o) => o.startsWith('SCORE::')) || a.type !== 'CHOOSE_EFFECT',
  );

  // Find the selected source by matching label
  const selectedSource = progress.pendingScoreEffects.find((s) => s.label === selectedLabel);
  if (!selectedSource) return state;

  // Remove the selected source from pending list
  const remainingSources = progress.pendingScoreEffects.filter((s) => s !== selectedSource);

  const currentRank = RANK_ORDER[progress.currentRankIndex];
  const missionIdx = newState.activeMissions.findIndex((m) => m.rank === currentRank);
  if (missionIdx === -1) return state;

  // Update progress with remaining sources
  newState.missionScoringProgress = {
    ...progress,
    missionCardScoreDone: selectedSource.instanceId === null ? true : progress.missionCardScoreDone,
    processedCharacterIds: selectedSource.instanceId
      ? [...progress.processedCharacterIds, selectedSource.instanceId]
      : progress.processedCharacterIds,
    pendingScoreEffects: remainingSources.length > 0 ? remainingSources : undefined,
  };

  // Resolve the selected SCORE effect
  const result = resolveSingleScoreEffect(
    newState,
    progress.winner,
    missionIdx,
    progress.currentRankIndex,
    selectedSource,
  );

  // If the resolved effect created its own pending (target selection), wait
  if (result.pendingActions.length > 0) {
    // Preserve the remaining sources in progress
    if (remainingSources.length > 0 && result.missionScoringProgress) {
      result.missionScoringProgress.pendingScoreEffects = remainingSources;
    }
    return result;
  }

  // Effect resolved without pending. If more SCORE effects remain, present choice again.
  if (remainingSources.length > 1) {
    return createScoreOrderChoice(result, progress.winner, missionIdx, progress.currentRankIndex, remainingSources);
  }

  if (remainingSources.length === 1) {
    // Only one left - resolve directly
    const lastResult = resolveSingleScoreEffect(
      result,
      progress.winner,
      missionIdx,
      progress.currentRankIndex,
      remainingSources[0],
    );
    if (lastResult.pendingActions.length > 0) {
      // Update progress for the last effect
      if (lastResult.missionScoringProgress) {
        lastResult.missionScoringProgress.missionCardScoreDone = remainingSources[0].instanceId === null
          ? true : lastResult.missionScoringProgress.missionCardScoreDone;
        if (remainingSources[0].instanceId) {
          lastResult.missionScoringProgress.processedCharacterIds = [
            ...lastResult.missionScoringProgress.processedCharacterIds,
            remainingSources[0].instanceId,
          ];
        }
      }
      return lastResult;
    }
    return lastResult;
  }

  // All SCORE effects resolved - clear pendingScoreEffects
  if (result.missionScoringProgress) {
    result.missionScoringProgress.pendingScoreEffects = undefined;
  }

  return result;
}

/**
 * Resume remaining SCORE effects after a pending (from an individual SCORE handler) was resolved.
 * This handles both the ordered-choice flow (pendingScoreEffects) and legacy sequential flow.
 */
function resolveRemainingScoreEffects(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  progress: MissionScoringProgress,
): GameState {
  let newState = { ...state };

  // If mission card SCORE wasn't done, it means we're resuming after its pending was resolved.
  // The handler already ran and created a pending; that pending has now been resolved.
  // Mark it as done - do NOT re-run the handler.
  if (!progress.missionCardScoreDone) {
    progress = { ...progress, missionCardScoreDone: true };
  }

  // If we have a pending SCORE effects list (player-ordered flow), use it
  if (progress.pendingScoreEffects && progress.pendingScoreEffects.length > 0) {
    const remaining = progress.pendingScoreEffects;

    if (remaining.length > 1) {
      // Multiple remain - present choice again
      return createScoreOrderChoice(newState, player, missionIndex, progress.currentRankIndex, remaining);
    }

    if (remaining.length === 1) {
      // Single remaining - resolve directly
      const lastResult = resolveSingleScoreEffect(
        newState,
        player,
        missionIndex,
        progress.currentRankIndex,
        remaining[0],
      );
      if (lastResult.pendingActions.length > 0) {
        if (lastResult.missionScoringProgress) {
          lastResult.missionScoringProgress.missionCardScoreDone = remaining[0].instanceId === null
            ? true : lastResult.missionScoringProgress.missionCardScoreDone;
          if (remaining[0].instanceId) {
            lastResult.missionScoringProgress.processedCharacterIds = [
              ...lastResult.missionScoringProgress.processedCharacterIds,
              remaining[0].instanceId,
            ];
          }
        }
        return lastResult;
      }
      return lastResult;
    }

    // All resolved
    return newState;
  }

  // Fallback: sequential flow (no pendingScoreEffects - legacy or single-effect path)
  const mission = newState.activeMissions[missionIndex];
  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const processedCharIds = [...progress.processedCharacterIds];

  for (const char of chars) {
    if (char.isHidden) continue;
    if (processedCharIds.includes(char.instanceId)) continue;

    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    const hasCharScore = (topCard.effects ?? []).some((e) => e.type === 'SCORE');
    if (!hasCharScore) continue;

    const result = EffectEngine.resolveScoreEffectSingle(newState, player, missionIndex, topCard.id, char);
    processedCharIds.push(char.instanceId);

    if (result.pending) {
      newState = result.state;
      newState.missionScoringProgress = {
        currentRankIndex: progress.currentRankIndex,
        missionCardScoreDone: true,
        processedCharacterIds: [...processedCharIds],
        winner: player,
      };
      return newState;
    }
    newState = result.state;
  }

  return newState;
}

/**
 * Orochimaru 051 (UC): [⧗] If you lost this mission during Mission Evaluation, move to another mission.
 */
function handleOrochimaru051Move(state: GameState, missionIndex: number, winner: PlayerID | null): GameState {
  let newState = state;
  const mission = newState.activeMissions[missionIndex];

  for (const side of ['player1Characters', 'player2Characters'] as const) {
    const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
    // Only trigger for the losing player
    if (winner === player || winner === null) continue;

    const chars = mission[side];
    for (const char of chars) {
      if (char.isHidden) continue;
      const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
      if (topCard.number !== 51) continue;

      const hasMove = (topCard.effects ?? []).some(
        (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('lost this mission'),
      );
      if (!hasMove) continue;

      // Kurenai 035: enemy characters cannot move from this mission
      if (isMovementBlockedByKurenai(newState, missionIndex, player)) continue;

      // Collect ALL valid destination missions
      const validDests: number[] = [];
      for (let i = 0; i < newState.activeMissions.length; i++) {
        if (i === missionIndex) continue;
        const destMission = newState.activeMissions[i];
        const destChars = player === 'player1' ? destMission.player1Characters : destMission.player2Characters;
        const hasSameName = destChars.some(
          (c) => !c.isHidden && c.card.name_fr.toUpperCase() === topCard.name_fr.toUpperCase(),
        );
        if (!hasSameName) {
          validDests.push(i);
        }
      }

      if (validDests.length === 0) continue;

      if (validDests.length === 1) {
        // Auto-move when only one valid destination
        const destIdx = validDests[0];
        newState = moveOrochimaru051(newState, missionIndex, destIdx, char.instanceId, side, player);
        break;
      }

      // Multiple destinations: ask the player to choose
      const effectId = generateInstanceId();
      const actionId = generateInstanceId();
      newState = { ...newState };
      newState.pendingEffects = [...newState.pendingEffects, {
        id: effectId,
        sourceCardId: topCard.id,
        sourceInstanceId: char.instanceId,
        sourceMissionIndex: missionIndex,
        effectType: 'MAIN' as const,
        effectDescription: 'Orochimaru (051): Choose a mission to move to.',
        targetSelectionType: 'OROCHIMARU051_CHOOSE_DESTINATION',
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
        type: 'SELECT_TARGET' as const,
        player,
        description: 'Orochimaru (051): Choose a mission to move this character to.',
        descriptionKey: 'game.effect.desc.orochimaru051ChooseDestination',
        options: validDests.map(String),
        minSelections: 1,
        maxSelections: 1,
        sourceEffectId: effectId,
      }];

      newState.log = logAction(
        newState.log, newState.turn, 'mission', player,
        'EFFECT_PENDING',
        'Orochimaru (051): Lost this mission. Choose a destination mission.',
        'game.log.effect.orochimaru051Pending',
        { card: 'OROCHIMARU', id: 'KS-051-UC' },
      );

      break;
    }
  }

  return newState;
}

/**
 * Execute the actual Orochimaru 051 move to a specific destination mission.
 */
export function moveOrochimaru051(
  state: GameState,
  sourceMissionIndex: number,
  destMissionIndex: number,
  instanceId: string,
  side: 'player1Characters' | 'player2Characters',
  player: PlayerID,
): GameState {
  let newState = { ...state };
  const missions = [...newState.activeMissions];
  const srcMission = { ...missions[sourceMissionIndex] };
  const destMission = { ...missions[destMissionIndex] };

  const char = srcMission[side].find((c) => c.instanceId === instanceId);
  if (!char) return state;

  srcMission[side] = srcMission[side].filter((c) => c.instanceId !== instanceId);
  const movedChar = { ...char, missionIndex: destMissionIndex };
  destMission[side] = [...destMission[side], movedChar];

  missions[sourceMissionIndex] = srcMission;
  missions[destMissionIndex] = destMission;
  newState.activeMissions = missions;

  newState.log = logAction(
    newState.log, newState.turn, 'mission', player,
    'EFFECT_MOVE',
    'Orochimaru (051): Lost mission ' + (sourceMissionIndex + 1) + ', moves to mission ' + (destMissionIndex + 1) + '.',
    'game.log.effect.orochimaru051Move',
    { card: 'OROCHIMARU', id: 'KS-051-UC' },
  );

  return newState;
}

/**
 * Calculate total power for a player on a specific mission.
 * Hidden characters contribute 0 power.
 * Applies continuous power modifiers.
 */
function calculateMissionPower(
  state: GameState,
  mission: ActiveMission,
  player: PlayerID,
): number {
  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  let totalPower = 0;

  for (const char of chars) {
    totalPower += calculateCharacterPower(state, char, player);
  }

  return Math.max(0, totalPower);
}
