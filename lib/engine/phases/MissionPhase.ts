import type { GameState, PlayerID, ActiveMission, MissionScoringProgress } from '../types';
import { logSystem, logAction } from '../utils/gameLog';
import { calculateCharacterPower } from './PowerCalculation';
import { EffectEngine } from '../../effects/EffectEngine';

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
    // No progress saved — nothing to resume
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

  // Clear progress for this mission — continue to remaining missions
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

  // Determine winner
  let winner: PlayerID | null = null;

  if (p1Power === 0 && p2Power === 0) {
    // Both have 0 power - no winner
    log = logSystem(log, state.turn, 'mission', 'NO_WINNER',
      `Neither player has power on mission ${missionIndex + 1}. No winner.`,
      'game.log.noWinner',
      { index: missionIndex + 1 },
    );
  } else if (p1Power > p2Power) {
    winner = 'player1';
  } else if (p2Power > p1Power) {
    winner = 'player2';
  } else {
    // Tie - edge holder wins
    winner = state.edgeHolder;
    log = logSystem(log, state.turn, 'mission', 'TIE_BREAK',
      `Tie on mission ${missionIndex + 1}. Edge holder (${state.edgeHolder}) wins.`,
      'game.log.tieBreak',
      { index: missionIndex + 1 },
    );
  }

  // Check minimum 1 power requirement
  if (winner === 'player1' && p1Power === 0) winner = null;
  if (winner === 'player2' && p2Power === 0) winner = null;

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
 * Resolve SCORE effects for a mission, saving progress when target selection is needed.
 */
function resolveScoreEffectsWithProgress(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  rankIndex: number,
): GameState {
  let newState = { ...state };
  const mission = newState.activeMissions[missionIndex];
  const processedCharIds: string[] = [];

  // Mission card SCORE effects
  const hasMissionScore = (mission.card.effects ?? []).some((e) => e.type === 'SCORE');
  if (hasMissionScore) {
    const result = EffectEngine.resolveScoreEffectSingle(newState, player, missionIndex, mission.card.id, null);
    if (result.pending) {
      // Save progress: mission card SCORE not done, no characters processed
      newState = result.state;
      newState.missionScoringProgress = {
        currentRankIndex: rankIndex,
        missionCardScoreDone: false,
        processedCharacterIds: [],
        winner: player,
      };
      return newState;
    }
    newState = result.state;
  }

  // Winner's character SCORE effects
  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  for (const char of chars) {
    if (char.isHidden) continue;
    const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
    const hasCharScore = (topCard.effects ?? []).some((e) => e.type === 'SCORE');
    if (!hasCharScore) continue;

    const result = EffectEngine.resolveScoreEffectSingle(newState, player, missionIndex, topCard.id, char);
    processedCharIds.push(char.instanceId);

    if (result.pending) {
      newState = result.state;
      newState.missionScoringProgress = {
        currentRankIndex: rankIndex,
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
 * Resume remaining character SCORE effects after a pending was resolved.
 */
function resolveRemainingScoreEffects(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  progress: MissionScoringProgress,
): GameState {
  let newState = { ...state };
  const mission = newState.activeMissions[missionIndex];

  // If mission card SCORE wasn't done, it means we're resuming after its pending was resolved.
  // The handler already ran and created a pending; that pending has now been resolved.
  // Mark it as done and proceed to character SCORE effects — do NOT re-run the handler.
  if (!progress.missionCardScoreDone) {
    progress = { ...progress, missionCardScoreDone: true };
  }

  // Continue with character SCORE effects, skipping already-processed ones
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

      // Find a valid destination
      let destIdx = -1;
      for (let i = 0; i < newState.activeMissions.length; i++) {
        if (i === missionIndex) continue;
        const destMission = newState.activeMissions[i];
        const destChars = player === 'player1' ? destMission.player1Characters : destMission.player2Characters;
        const hasSameName = destChars.some(
          (c) => !c.isHidden && c.card.name_fr.toUpperCase() === topCard.name_fr.toUpperCase(),
        );
        if (!hasSameName) {
          destIdx = i;
          break;
        }
      }

      if (destIdx === -1) continue;

      // Move the character
      const missions = [...newState.activeMissions];
      const srcMission = { ...missions[missionIndex] };
      const destMission = { ...missions[destIdx] };

      srcMission[side] = srcMission[side].filter((c) => c.instanceId !== char.instanceId);
      const movedChar = { ...char, missionIndex: destIdx };
      destMission[side] = [...destMission[side], movedChar];

      missions[missionIndex] = srcMission;
      missions[destIdx] = destMission;
      newState = { ...newState, activeMissions: missions };

      newState.log = logAction(
        newState.log, newState.turn, 'mission', player,
        'EFFECT_MOVE',
        `Orochimaru (051): Lost mission ${missionIndex + 1}, moves to mission ${destIdx + 1}.`,
        'game.log.effect.orochimaru051Move',
        { card: 'OROCHIMARU', id: 'KS-051-UC' },
      );

      break;
    }
  }

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
