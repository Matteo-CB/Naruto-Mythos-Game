import type { GameState, PlayerID, ActiveMission, MissionScoringProgress, ScoreEffectSource, PendingEffect, PendingAction } from '../types';
import { logSystem, logAction } from '../utils/gameLog';
import { calculateCharacterPower } from './PowerCalculation';
import { teamTrainingBonus, missionCarries, SS_MISSION_HIGH_PRIORITY } from '../../effects/missions/ssMissions';
import { generateInstanceId } from '../utils/id';
import { EffectEngine } from '../../effects/EffectEngine';
import { isMovementBlockedByKurenai, applyRempartTokenRemoval } from '../../effects/ContinuousEffects';

const RANK_ORDER = ['D', 'C', 'B', 'A'] as const;


export function executeMissionPhase(state: GameState): GameState {
  let newState: GameState = { ...state, missionScoringProgress: undefined };

  
  newState = applyRempartTokenRemoval(newState);

  
  for (let rankIdx = 0; rankIdx < RANK_ORDER.length; rankIdx++) {
    const rank = RANK_ORDER[rankIdx];
    const missionIdx = newState.activeMissions.findIndex((m) => m.rank === rank);
    if (missionIdx === -1) continue;

    newState = scoreMission(newState, missionIdx, rankIdx);

    
    if (newState.pendingActions.length > 0) {
      return newState;
    }
  }

  return newState;
}


export function resumeMissionScoring(state: GameState): GameState {
  let newState = { ...state };
  const progress = newState.missionScoringProgress;

  if (!progress) {
    
    return newState;
  }

  
  const currentRank = RANK_ORDER[progress.currentRankIndex];
  const missionIdx = newState.activeMissions.findIndex((m) => m.rank === currentRank);

  if (missionIdx !== -1) {
    if (progress.pendingScoreAfterOrochimaru) {
      const { winner: scoreWinner, missionIndex: scoreMissionIdx, rankIndex: scoreRankIdx } = progress.pendingScoreAfterOrochimaru;
      newState = { ...newState, missionScoringProgress: undefined };
      newState = resolveScoreEffectsWithProgress(newState, scoreWinner, scoreMissionIdx, scoreRankIdx);
      if (newState.pendingActions.length > 0) {
        return newState;
      }
    } else if (!progress.currentRankComplete) {
      newState = resolveRemainingScoreEffects(newState, progress.winner, missionIdx, progress);

      if (newState.pendingActions.length > 0) {
        return newState;
      }

      const mission = newState.activeMissions[missionIdx];
      const missionWinner = mission.wonBy ?? null;
      if (missionWinner && missionWinner !== 'draw') {
        const missionLoser: PlayerID = missionWinner === 'player1' ? 'player2' : 'player1';

        if (!(newState.edgeHolder === missionLoser && checkOrochimaru051OnMission(newState, missionIdx, missionLoser))) {
          newState = handleOrochimaru051Move(newState, missionIdx, missionWinner);

          if (newState.pendingActions.length > 0) {
            newState.missionScoringProgress = {
              currentRankIndex: progress.currentRankIndex,
              missionCardScoreDone: true,
              processedCharacterIds: [],
              winner: progress.winner,
              currentRankComplete: true,
            };
            return newState;
          }
        }
      }
    }
  }

  
  newState = { ...newState, missionScoringProgress: undefined };

  
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


function checkOrochimaru051OnMission(state: GameState, missionIndex: number, player: PlayerID): boolean {
  const mission = state.activeMissions[missionIndex];
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  for (const char of mission[side]) {
    if (char.isHidden) continue;
    const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
    if (topCard.number !== 51) continue;
    const hasMove = (topCard.effects ?? []).some(
      (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('lost this mission'),
    );
    if (hasMove) return true;
  }
  return false;
}

function scoreMission(state: GameState, missionIndex: number, rankIndex: number): GameState {
  const mission = state.activeMissions[missionIndex];

  
  const p1Power = calculateMissionPower(state, mission, 'player1');
  const p2Power = calculateMissionPower(state, mission, 'player2');

  let log = logSystem(
    state.log,
    state.turn,
    'mission',
    'SCORE_MISSION',
    `Mission ${missionIndex + 1} (${mission.rank}): "${mission.card.name_fr}" - Player1: ${p1Power} power vs Player2: ${p2Power} power.`,
    'game.log.scoreMission',
    { index: missionIndex + 1, rank: mission.rank, name: mission.card.name_fr, name_en: mission.card.name_en || mission.card.name_fr, p1Power, p2Power },
  );

  
  
  let winner: PlayerID | 'draw' | null = null;

  if (p1Power > p2Power) {
    winner = p1Power >= 1 ? 'player1' : 'draw';
  } else if (p2Power > p1Power) {
    winner = p2Power >= 1 ? 'player2' : 'draw';
  } else {
    
    winner = p1Power >= 1 ? state.edgeHolder : 'draw';
  }

  if (winner === 'draw') {
    log = logSystem(log, state.turn, 'mission', 'NO_WINNER',
      `Mission ${missionIndex + 1}: Neither player has enough power to win (${p1Power} vs ${p2Power}).`,
      'game.log.noWinner',
      { index: missionIndex + 1 },
    );
  } else if (p1Power === p2Power) {
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

  if (winner && winner !== 'draw') {
    const basePts = Number.isFinite(mission.basePoints) ? mission.basePoints : 1;
    const rankPts = Number.isFinite(mission.rankBonus) ? mission.rankBonus : 0;
    const scoreMultiplier = missionCarries(mission, SS_MISSION_HIGH_PRIORITY) ? 2 : 1;
    const points = (basePts + rankPts) * scoreMultiplier;
    const ps = { ...newState[winner] };
    const prior = Number.isFinite(ps.missionPoints) ? ps.missionPoints : 0;
    ps.missionPoints = prior + points;

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

    
    
    const loser: PlayerID = winner === 'player1' ? 'player2' : 'player1';
    const loserHasOro051 = checkOrochimaru051OnMission(newState, missionIndex, loser);

    if (loserHasOro051 && newState.edgeHolder === loser) {
      
      newState = handleOrochimaru051Move(newState, missionIndex, winner);

      if (newState.pendingActions.length > 0) {
        
        newState.missionScoringProgress = {
          currentRankIndex: rankIndex,
          missionCardScoreDone: false,
          processedCharacterIds: [],
          winner,
          pendingScoreAfterOrochimaru: { winner, missionIndex, rankIndex },
        };
        return newState;
      }

      
      newState = resolveScoreEffectsWithProgress(newState, winner, missionIndex, rankIndex);
      if (newState.pendingActions.length > 0) {
        return newState;
      }
    } else {
      newState = resolveScoreEffectsWithProgress(newState, winner, missionIndex, rankIndex);

      if (newState.pendingActions.length > 0) {
        return newState;
      }

      newState = handleOrochimaru051Move(newState, missionIndex, winner);
      if (newState.pendingActions.length > 0) {
        newState.missionScoringProgress = {
          currentRankIndex: rankIndex,
          missionCardScoreDone: true,
          processedCharacterIds: [],
          winner,
          currentRankComplete: true,
        };
        return newState;
      }
    }
  } else {
    newState = handleOrochimaru051Move(newState, missionIndex, winner);
    if (newState.pendingActions.length > 0) {
      newState.missionScoringProgress = {
        currentRankIndex: rankIndex,
        missionCardScoreDone: true,
        processedCharacterIds: [],
        winner: state.edgeHolder,
        currentRankComplete: true,
      };
      return newState;
    }
  }

  return newState;
}


function collectScoreEffectSources(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
): ScoreEffectSource[] {
  const mission = state.activeMissions[missionIndex];
  const sources: ScoreEffectSource[] = [];
  
  const processed = state.missionScoringProgress?.processedCharacterIds ?? [];
  const missionScoreDone = state.missionScoringProgress?.missionCardScoreDone ?? false;

  
  if (!missionScoreDone) {
    const hasMissionScore = (mission.card.effects ?? []).some((e) => e.type === 'SCORE');
    if (hasMissionScore) {
      const scoreEffect = (mission.card.effects ?? []).find((e) => e.type === 'SCORE');
      sources.push({
        cardId: mission.card.id,
        instanceId: null,
        label: `${mission.card.name_fr} (Mission) - ${scoreEffect?.description ?? 'SCORE'}`,
      });
    }
  }

  
  for (const att of mission.attachments ?? []) {
    if (att.owner !== player) continue;
    if (processed.includes(att.instanceId)) continue;
    const attScore = (att.card.effects ?? []).find((e) => e.type === 'SCORE');
    if (!attScore) continue;
    sources.push({
      cardId: att.card.id,
      instanceId: att.instanceId,
      label: `${att.card.name_fr} - ${attScore.description}`,
    });
  }

  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  for (const char of chars) {
    if (char.isHidden) continue;
    if (processed.includes(char.instanceId)) continue; // Already resolved
    const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
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

  
  const previousProgress = newState.missionScoringProgress;
  const sameMissionRank = previousProgress?.currentRankIndex === rankIndex && previousProgress?.winner === player;
  newState.missionScoringProgress = {
    currentRankIndex: rankIndex,
    missionCardScoreDone: sameMissionRank ? (previousProgress?.missionCardScoreDone ?? false) : false,
    processedCharacterIds: sameMissionRank ? [...(previousProgress?.processedCharacterIds ?? [])] : [],
    winner: player,
    pendingScoreEffects: pendingSources,
  };

  return newState;
}


function resolveScoreEffectsWithProgress(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  rankIndex: number,
): GameState {
  const sources = collectScoreEffectSources(state, player, missionIndex);
  const doubled = missionCarries(state.activeMissions[missionIndex], SS_MISSION_HIGH_PRIORITY);
  if (doubled && sources.length > 0) {
    const first = resolveScoreEffectsOnce(state, player, missionIndex, rankIndex, sources);
    if (first.pendingActions.length > 0) return first;
    const secondSources = collectScoreEffectSources(
      { ...first, missionScoringProgress: undefined }, player, missionIndex,
    );
    if (secondSources.length === 0) return first;
    return resolveScoreEffectsOnce(first, player, missionIndex, rankIndex, secondSources);
  }
  return resolveScoreEffectsOnce(state, player, missionIndex, rankIndex, sources);
}

function resolveScoreEffectsOnce(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  rankIndex: number,
  sources: ScoreEffectSource[],
): GameState {

  if (sources.length === 0) {
    return state;
  }

  
  if (sources.length === 1) {
    return resolveSingleScoreEffect(state, player, missionIndex, rankIndex, sources[0]);
  }

  
  return createScoreOrderChoice(state, player, missionIndex, rankIndex, sources);
}


function resolveSingleScoreEffect(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  rankIndex: number,
  source: ScoreEffectSource,
): GameState {
  let newState = { ...state };
  const mission = newState.activeMissions[missionIndex];

  
  let character = null;
  if (source.instanceId) {
    const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
    character = chars.find((c) => c.instanceId === source.instanceId) ?? null;
  }

  const result = EffectEngine.resolveScoreEffectSingle(newState, player, missionIndex, source.cardId, character);

  if (result.pending) {
    newState = result.state;
    
    const existingProcessed = newState.missionScoringProgress?.processedCharacterIds ?? [];
    const processedCharIds: string[] = source.instanceId
      ? [...existingProcessed, source.instanceId]
      : existingProcessed;
    newState.missionScoringProgress = {
      currentRankIndex: rankIndex,
      missionCardScoreDone: !source.instanceId ? true : (newState.missionScoringProgress?.missionCardScoreDone ?? false),
      processedCharacterIds: processedCharIds,
      winner: player,
      
    };
    return newState;
  }

  newState = result.state;
  return newState;
}


export function resolveChosenScoreEffect(
  state: GameState,
  selectedLabel: string,
): GameState {
  let newState = { ...state };
  const progress = newState.missionScoringProgress;
  if (!progress || !progress.pendingScoreEffects) return state;

  
  newState.pendingEffects = newState.pendingEffects.filter(
    (e) => e.targetSelectionType !== 'CHOOSE_SCORE_ORDER',
  );
  newState.pendingActions = newState.pendingActions.filter(
    (a) => !a.options.some((o) => o.startsWith('SCORE::')) || a.type !== 'CHOOSE_EFFECT',
  );

  
  const selectedSource = progress.pendingScoreEffects.find((s) => s.label === selectedLabel);
  if (!selectedSource) return state;

  
  const remainingSources = progress.pendingScoreEffects.filter((s) => s !== selectedSource);

  const currentRank = RANK_ORDER[progress.currentRankIndex];
  const missionIdx = newState.activeMissions.findIndex((m) => m.rank === currentRank);
  if (missionIdx === -1) return state;

  
  newState.missionScoringProgress = {
    ...progress,
    missionCardScoreDone: selectedSource.instanceId === null ? true : progress.missionCardScoreDone,
    processedCharacterIds: selectedSource.instanceId
      ? [...progress.processedCharacterIds, selectedSource.instanceId]
      : progress.processedCharacterIds,
    pendingScoreEffects: remainingSources.length > 0 ? remainingSources : undefined,
  };

  
  const result = resolveSingleScoreEffect(
    newState,
    progress.winner,
    missionIdx,
    progress.currentRankIndex,
    selectedSource,
  );

  
  if (result.pendingActions.length > 0) {
    
    if (remainingSources.length > 0 && result.missionScoringProgress) {
      result.missionScoringProgress.pendingScoreEffects = remainingSources;
    }
    return result;
  }

  
  if (remainingSources.length > 1) {
    return createScoreOrderChoice(result, progress.winner, missionIdx, progress.currentRankIndex, remainingSources);
  }

  if (remainingSources.length === 1) {
    
    const lastResult = resolveSingleScoreEffect(
      result,
      progress.winner,
      missionIdx,
      progress.currentRankIndex,
      remainingSources[0],
    );
    if (lastResult.pendingActions.length > 0) {
      
      if (lastResult.missionScoringProgress) {
        lastResult.missionScoringProgress.missionCardScoreDone = remainingSources[0].instanceId === null
          ? true : lastResult.missionScoringProgress.missionCardScoreDone;
        if (remainingSources[0].instanceId) {
          lastResult.missionScoringProgress.processedCharacterIds = [
            ...lastResult.missionScoringProgress.processedCharacterIds,
            remainingSources[0].instanceId,
          ];
        }
        
        lastResult.missionScoringProgress.pendingScoreEffects = undefined;
      }
      return lastResult;
    }
    return lastResult;
  }

  
  if (result.missionScoringProgress) {
    result.missionScoringProgress.pendingScoreEffects = undefined;
  }

  return result;
}


function resolveRemainingScoreEffects(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  progress: MissionScoringProgress,
): GameState {
  let newState = { ...state };

  
  
  
  if (!progress.missionCardScoreDone) {
    progress = { ...progress, missionCardScoreDone: true };
  }

  
  if (progress.pendingScoreEffects && progress.pendingScoreEffects.length > 0) {
    const remaining = progress.pendingScoreEffects;

    if (remaining.length > 1) {
      
      return createScoreOrderChoice(newState, player, missionIndex, progress.currentRankIndex, remaining);
    }

    if (remaining.length === 1) {
      
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
          
          lastResult.missionScoringProgress.pendingScoreEffects = undefined;
        }
        return lastResult;
      }
      return lastResult;
    }

    
    return newState;
  }

  
  const mission = newState.activeMissions[missionIndex];
  const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
  const processedCharIds = [...progress.processedCharacterIds];

  for (const char of chars) {
    if (char.isHidden) continue;
    if (processedCharIds.includes(char.instanceId)) continue;

    const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
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


function handleOrochimaru051Move(state: GameState, missionIndex: number, winner: PlayerID | 'draw' | null): GameState {
  let newState = state;
  const mission = newState.activeMissions[missionIndex];

  for (const side of ['player1Characters', 'player2Characters'] as const) {
    const player: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
    
    if (winner === player || winner === null || winner === 'draw') continue;

    const chars = mission[side];
    for (const char of chars) {
      if (char.isHidden) continue;
      const topCard = char.stack?.length > 0 ? char.stack[char.stack?.length - 1] : char.card;
      if (topCard.number !== 51) continue;

      const hasMove = (topCard.effects ?? []).some(
        (e) => e.type === 'MAIN' && e.description.includes('[⧗]') && e.description.includes('lost this mission'),
      );
      if (!hasMove) continue;

      
      if (isMovementBlockedByKurenai(newState, missionIndex, player)) continue;

      
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
        
        const destIdx = validDests[0];
        newState = moveOrochimaru051(newState, missionIndex, destIdx, char.instanceId, side, player);
        break;
      }

      
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

  return totalPower + teamTrainingBonus(mission, player);
}
