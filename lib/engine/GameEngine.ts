import type {
  GameState,
  GameConfig,
  GameAction,
  PlayerID,
  PlayerState,
  CharacterCard,
  MissionCard,
  ActiveMission,
  CharacterInPlay,
  VisibleGameState,
  VisibleOpponentState,
  VisibleMission,
  VisibleCharacter,
  TurnNumber,
  PendingEffect,
  EffectType,
} from './types';
import {
  INITIAL_HAND_SIZE,
  TOTAL_TURNS,
} from './types';
import { deepClone } from './utils/deepClone';
import { shuffle } from './utils/shuffle';
import { generateGameId, generateInstanceId, resetIdCounter } from './utils/id';
import { logSystem, logAction } from './utils/gameLog';
import { executeStartPhase } from './phases/StartPhase';
import { executeAction, getValidActionsForPlayer } from './phases/ActionPhase';
import { executeMissionPhase, resumeMissionScoring, resolveChosenScoreEffect } from './phases/MissionPhase';
import { executeEndPhase, handleRockLee117Move, handleAkamaru028Return, handleGiantSpider103EndOfRound, returnCharacterToHand, processChosenEndOfRoundEffect, processRemainingEndOfRoundEffects, finalizeEndPhase } from './phases/EndPhase';
import { EffectEngine } from '../effects/EffectEngine';
import { calculateCharacterPower } from './phases/PowerCalculation';
import { isRempartZeroed, canBeHiddenByEnemy } from '../effects/ContinuousEffects';
import { triggerOnDefeatEffects } from '../effects/onDefeatTriggers';
import { getEffectivePower } from '../effects/powerUtils';
import { isCopyableEffectType } from '../effects/handlers/KS/shared/copyExclusions';


function collectCharInstanceIds(state: GameState): Set<string> {
  const ids = new Set<string>();
  for (const mission of state.activeMissions) {
    for (const c of mission.player1Characters) ids.add(c.instanceId);
    for (const c of mission.player2Characters) ids.add(c.instanceId);
  }
  return ids;
}

export class GameEngine {
  
  static createGame(config: GameConfig): GameState {
    
    
    
    
    
    const gameId = generateGameId();

    
    const startingPlayer: PlayerID = Math.random() < 0.5 ? 'player1' : 'player2';

    const p1Missions = shuffle(config.player1.missionCards);
    const p2Missions = shuffle(config.player2.missionCards);
    const p1SelectedMissions = p1Missions.slice(0, 2);
    const p2SelectedMissions = p2Missions.slice(0, 2);
    const p1UnusedMission = p1Missions[2] || null;
    const p2UnusedMission = p2Missions[2] || null;

    let missionDeck: MissionCard[];
    if (config.gameMode === 'ranked') {
      const edgeMissions = startingPlayer === 'player1' ? p1SelectedMissions : p2SelectedMissions;
      const otherMissions = startingPlayer === 'player1' ? p2SelectedMissions : p1SelectedMissions;
      missionDeck = [edgeMissions[0], otherMissions[0], edgeMissions[1], otherMissions[1]].filter(Boolean);
    } else {
      missionDeck = shuffle([...p1SelectedMissions, ...p2SelectedMissions]);
    }

    
    const p1Deck = shuffle([...config.player1.deck]);
    const p2Deck = shuffle([...config.player2.deck]);

    
    const p1Hand = p1Deck.splice(0, INITIAL_HAND_SIZE);
    const p2Hand = p2Deck.splice(0, INITIAL_HAND_SIZE);

    const p1StartMP = config.startingMissionPoints?.player1 ?? 0;
    const p2StartMP = config.startingMissionPoints?.player2 ?? 0;
    const safeStartMP = (n: number): number => (Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);

    const player1: PlayerState = {
      id: 'player1',
      userId: config.player1.userId,
      isAI: config.player1.isAI,
      aiDifficulty: config.player1.aiDifficulty,
      deck: p1Deck,
      hand: p1Hand,
      discardPile: [],
      missionCards: config.player1.missionCards,
      chakra: 0,
      missionPoints: safeStartMP(p1StartMP),
      hasPassed: false,
      hasMulliganed: false,
      charactersInPlay: 0,
      unusedMission: p1UnusedMission,
    };

    const player2: PlayerState = {
      id: 'player2',
      userId: config.player2.userId,
      isAI: config.player2.isAI,
      aiDifficulty: config.player2.aiDifficulty,
      deck: p2Deck,
      hand: p2Hand,
      discardPile: [],
      missionCards: config.player2.missionCards,
      chakra: 0,
      missionPoints: safeStartMP(p2StartMP),
      hasPassed: false,
      hasMulliganed: false,
      charactersInPlay: 0,
      unusedMission: p2UnusedMission,
    };

    const state: GameState = {
      gameId,
      gameMode: config.gameMode,
      player1UserId: config.player1.userId ?? undefined,
      player2UserId: config.player2.userId ?? undefined,
      turn: 1 as TurnNumber,
      phase: 'mulligan',
      activePlayer: startingPlayer,
      edgeHolder: startingPlayer,
      firstPasser: null,
      player1,
      player2,
      missionDeck,
      activeMissions: [],
      log: [],
      pendingEffects: [],
      pendingActions: [],
      turnMissionRevealed: false,
      consecutiveTimeouts: { player1: 0, player2: 0 },
      actionHistory: [],
    };

    return {
      ...state,
      log: logSystem(state.log, 1, 'setup', 'GAME_START', `Game created. ${startingPlayer} has the Edge token.`,
        'game.log.gameStart', { player: startingPlayer }),
    };
  }

  
  static applyAction(state: GameState, player: PlayerID, action: GameAction): GameState {

    const prevCharIds = collectCharInstanceIds(state);

    let newState = deepClone(state);


    if (!newState.actionHistory) newState.actionHistory = [];
    newState.actionHistory.push({ player, action });




    const isNewActionStart =
      action.type === 'PLAY_CHARACTER' ||
      action.type === 'PLAY_HIDDEN' ||
      action.type === 'REVEAL_CHARACTER' ||
      action.type === 'UPGRADE_CHARACTER' ||
      action.type === 'PASS';
    if (isNewActionStart) {
      newState.turnPlayedIds = [];
    }


    if (action.type === 'FORFEIT') {
      newState.phase = 'gameOver';
      newState.forfeitedBy = player;
      return newState;
    }

    switch (newState.phase) {
      case 'mulligan':
        newState = GameEngine.handleMulligan(newState, player, action);
        break;

      case 'start':
        
        
        break;

      case 'action':
        if (action.type === 'REORDER_EFFECTS') {
          newState = GameEngine.handleReorderEffects(newState, player, action.selectedEffectId);
          break;
        }
        if (action.type === 'SELECT_TARGET' || action.type === 'DECLINE_OPTIONAL_EFFECT') {
          
          newState = GameEngine.handlePendingAction(newState, player, action);
          
          
          
          if (newState.pendingDiscardReorder && newState.pendingEffects.length === 0 && newState.pendingActions.length === 0) {
            const pdr = newState.pendingDiscardReorder;
            newState.pendingDiscardReorder = undefined;
            const effectSource = pdr.chooser === pdr.discardOwner
              ? (pdr.discardOwner === 'player1' ? 'player2' : 'player1') // Itachi 140: opponent chooses their own pile
              : pdr.chooser; // Normal: attacker chooses opponent's pile
            const selectingOverride = pdr.chooser === pdr.discardOwner ? pdr.chooser : undefined;
            newState = EffectEngine.createReorderDiscardPending(newState, pdr.discardOwner, effectSource, pdr.count, selectingOverride, undefined, pdr.targetInstanceIds);
            break;
          }

          
          
          if (newState.pendingContinuation && newState.pendingEffects.length === 0 && newState.pendingActions.length === 0) {
            const cont = newState.pendingContinuation;
            newState.pendingContinuation = undefined;
            
            if (cont.chainData) {
              for (const [k, v] of Object.entries(cont.chainData)) {
                (newState as any)[k] = v;
              }
            }
            const syntheticPending: PendingEffect = {
              id: '', sourceCardId: cont.sourceCardId,
              sourceInstanceId: cont.sourceInstanceId,
              sourceMissionIndex: cont.sourceMissionIndex,
              effectType: 'MAIN' as EffectType,
              effectDescription: '', targetSelectionType: '',
              sourcePlayer: cont.sourcePlayer,
              requiresTargetSelection: false, validTargets: [],
              isOptional: false, isMandatory: false, resolved: true,
              isUpgrade: cont.isUpgrade, wasRevealed: cont.wasRevealed,
              remainingEffectTypes: cont.remainingEffectTypes,
            };
            newState = EffectEngine.processRemainingEffects(newState, syntheticPending);
            
            if (newState.pendingEffects.length > 0 || newState.pendingActions.length > 0) break;
            
          }

          
          if (newState.pendingDiscardReorder && newState.pendingEffects.length === 0 && newState.pendingActions.length === 0) {
            const pdr2 = newState.pendingDiscardReorder;
            newState.pendingDiscardReorder = undefined;
            const effectSource2 = pdr2.chooser === pdr2.discardOwner
              ? (pdr2.discardOwner === 'player1' ? 'player2' : 'player1')
              : pdr2.chooser;
            const selectingOverride2 = pdr2.chooser === pdr2.discardOwner ? pdr2.chooser : undefined;
            newState = EffectEngine.createReorderDiscardPending(newState, pdr2.discardOwner, effectSource2, pdr2.count, selectingOverride2, undefined, pdr2.targetInstanceIds);
            break;
          }

          if (newState.phase === 'action' &&
              newState.pendingEffects.length === 0 &&
              newState.pendingActions.length === 0 &&
              !newState.player1.hasPassed &&
              !newState.player2.hasPassed) {
            
            
            
            
            if (newState.pendingForcedResolver) {
              newState.activePlayer = newState.pendingForcedResolver;
              newState.pendingForcedResolver = undefined;
            } else {
              
              
              
              
              const resolvedAction = state.pendingActions.find((p) => {
                if (action.type === 'SELECT_TARGET') return p.id === action.pendingActionId;
                if (action.type === 'DECLINE_OPTIONAL_EFFECT') {
                  const eff = state.pendingEffects.find((e) => e.id === action.pendingEffectId);
                  return eff && p.sourceEffectId === eff.id;
                }
                return false;
              });
              if (!newState.sandboxNoAlternate) {
                const turnOwner = resolvedAction?.originPlayer ?? player;
                const otherPlayer: PlayerID = turnOwner === 'player1' ? 'player2' : 'player1';
                newState.activePlayer = otherPlayer;
              }
            }
          }
        } else {
          newState = executeAction(newState, player, action);
        }
        
        
        if (newState.phase === 'mission' && newState.pendingActions.length === 0 && newState.pendingEffects.length === 0) {
          newState = GameEngine.transitionToMissionPhase(newState);
        }
        break;

      case 'mission':
        
        if (action.type === 'ADVANCE_PHASE') {
          newState.missionScoringComplete = undefined;
          newState = GameEngine.transitionToEndPhase(newState);
          break;
        }
        
        if (action.type === 'REORDER_EFFECTS') {
          newState = GameEngine.handleReorderEffects(newState, player, action.selectedEffectId);
          break;
        }
        
        if (action.type === 'SELECT_TARGET') {
          const chooseScorePending = newState.pendingEffects.find(
            (e) => e.targetSelectionType === 'CHOOSE_SCORE_ORDER',
          );
          if (chooseScorePending) {
            const selectedOption = action.selectedTargets[0] ?? '';
            const label = selectedOption.startsWith('SCORE::') ? selectedOption.substring(7) : selectedOption;
            newState = resolveChosenScoreEffect(newState, label);
            
            if (newState.pendingActions.length > 0) break;
            
            if (newState.missionScoringProgress) {
              newState = resumeMissionScoring(newState);
              if (newState.pendingActions.length > 0) break;
            }
            newState.missionScoringComplete = true;
            break;
          }
        }
        
        if (action.type === 'SELECT_TARGET' || action.type === 'DECLINE_OPTIONAL_EFFECT') {
          newState = GameEngine.handlePendingAction(newState, player, action);

          if (newState.pendingActions.length === 0) {
            if (newState.pendingEffects.length > 0) {
              newState.pendingEffects = [];
            }
            if (newState.missionScoringProgress) {
              newState = resumeMissionScoring(newState);
              if (newState.pendingActions.length > 0) break;
            }
            newState.missionScoringComplete = true;
          }
        }

        if (
          newState.phase === 'mission' &&
          newState.pendingActions.length === 0 &&
          !newState.missionScoringProgress &&
          !newState.missionScoringComplete
        ) {
          newState.pendingEffects = [];
          newState.missionScoringComplete = true;
        }
        break;

      case 'end':
        
        if (action.type === 'REORDER_EFFECTS') {
          newState = GameEngine.handleReorderEffects(newState, player, action.selectedEffectId);
          break;
        }

        
        if (action.type === 'SELECT_TARGET' || action.type === 'DECLINE_OPTIONAL_EFFECT') {
          
          if (action.type === 'SELECT_TARGET') {
            const pa = newState.pendingActions.find((p) => p.id === action.pendingActionId);
            const pe = pa ? newState.pendingEffects.find((e) => e.id === pa.sourceEffectId) : null;
            if (pe?.targetSelectionType === 'END_OF_ROUND_EFFECT_ORDER') {
              const chosenInstanceId = action.selectedTargets[0];
              newState = deepClone(newState);
              
              newState.pendingEffects = newState.pendingEffects.filter((e) => e.id !== pe.id);
              newState.pendingActions = newState.pendingActions.filter((a) => a.id !== pa!.id);
              
              newState = processChosenEndOfRoundEffect(newState, chosenInstanceId);
              if (newState.pendingActions.length > 0) break;
              
              newState = processRemainingEndOfRoundEffects(newState);
              if (newState.pendingActions.length > 0) break;
              
              newState = finalizeEndPhase(newState);
              
              newState.endPhaseMovedIds = undefined;
              newState.endPhaseAkamaru028Ids = undefined;
              newState.endPhaseGiantSpider103Ids = undefined;
              newState.endPhaseTokensRemoved = undefined;
              if (newState.turn >= TOTAL_TURNS) {
                newState = GameEngine.endGame(newState);
              } else {
                newState.turn = (newState.turn + 1) as TurnNumber;
                newState = GameEngine.transitionToStartPhase(newState);
              }
              break;
            }
          }

          newState = GameEngine.handlePendingAction(newState, player, action);
          
          if (newState.pendingActions.length === 0 && newState.pendingEffects.length === 0) {
            
            newState = processRemainingEndOfRoundEffects(newState);
            if (newState.pendingActions.length > 0) break;

            
            newState = finalizeEndPhase(newState);

            
            newState.endPhaseMovedIds = undefined;
            newState.endPhaseAkamaru028Ids = undefined;
            newState.endPhaseGiantSpider103Ids = undefined;
            newState.endPhaseTokensRemoved = undefined;
            if (newState.turn >= TOTAL_TURNS) {
              newState = GameEngine.endGame(newState);
            } else {
              newState.turn = (newState.turn + 1) as TurnNumber;
              newState = GameEngine.transitionToStartPhase(newState);
            }
          }
        } else if (action.type === 'ADVANCE_PHASE' && newState.pendingActions.length === 0) {
          
          
          newState.pendingEffects = [];
          newState.endPhaseMovedIds = undefined;
          newState.endPhaseAkamaru028Ids = undefined;
          newState.endPhaseGiantSpider103Ids = undefined;
          newState.endPhaseTokensRemoved = undefined;
          if (newState.turn >= TOTAL_TURNS) {
            newState = GameEngine.endGame(newState);
          } else {
            newState.turn = (newState.turn + 1) as TurnNumber;
            newState = GameEngine.transitionToStartPhase(newState);
          }
        }
        break;

      case 'gameOver':
        
        break;
    }

    
    if (newState.actionHistory && newState.actionHistory.length > 0) {
      const newCharIds = collectCharInstanceIds(newState);
      const created: string[] = [];
      for (const id of newCharIds) {
        if (!prevCharIds.has(id)) created.push(id);
      }
      if (created.length > 0) {
        newState.actionHistory[newState.actionHistory.length - 1].createdIds = created;
      }
    }

    return newState;
  }

  
  static handleMulligan(state: GameState, player: PlayerID, action: GameAction): GameState {
    if (action.type !== 'MULLIGAN') return state;

    const playerState = state[player];
    if (playerState.hasMulliganed) return state; // Already mulliganed

    let newState = deepClone(state);
    const ps = newState[player];

    if (action.doMulligan) {
      
      ps.deck = shuffle([...ps.deck, ...ps.hand]);
      ps.hand = ps.deck.splice(0, INITIAL_HAND_SIZE);
      newState.log = logSystem(newState.log, 1, 'mulligan', 'MULLIGAN', `${player} mulligans their hand.`,
        'game.log.mulligan', { player });
    } else {
      newState.log = logSystem(newState.log, 1, 'mulligan', 'KEEP_HAND', `${player} keeps their hand.`,
        'game.log.keepHand', { player });
    }

    ps.hasMulliganed = true;

    
    const otherPlayer: PlayerID = player === 'player1' ? 'player2' : 'player1';
    if (newState[otherPlayer].hasMulliganed) {
      
      newState = GameEngine.transitionToStartPhase(newState);
    }

    return newState;
  }

  
  static transitionToStartPhase(state: GameState): GameState {
    let newState = deepClone(state);
    newState.phase = 'start';
    newState.turnMissionRevealed = false;
    newState.player1.hasPassed = false;
    newState.player2.hasPassed = false;
    newState.firstPasser = null;
    newState.edgeLockedFor = null;

    
    newState = executeStartPhase(newState);

    
    newState.phase = 'action';
    newState.activePlayer = newState.edgeHolder;

    return newState;
  }

  
  static transitionToMissionPhase(state: GameState): GameState {
    let newState = deepClone(state);
    newState.phase = 'mission';

    
    
    newState.activeMissions = newState.activeMissions.map(m => ({ ...m, wonBy: null }));

    
    newState = executeMissionPhase(newState);

    
    if (newState.pendingActions.length > 0) {
      return newState;
    }

    
    
    newState.missionScoringComplete = true;
    return newState;
  }

  
  static transitionToEndPhase(state: GameState): GameState {
    let newState = deepClone(state);
    newState.phase = 'end';
    newState.missionScoringProgress = undefined;

    
    newState = executeEndPhase(newState);

    
    if (newState.pendingActions.length > 0) {
      return newState;
    }

    
    newState.endPhaseMovedIds = undefined;
    newState.endPhaseAkamaru028Ids = undefined;
    newState.endPhaseGiantSpider103Ids = undefined;
    newState.endPhaseTokensRemoved = undefined;

    
    if (newState.turn >= TOTAL_TURNS) {
      return GameEngine.endGame(newState);
    }

    
    newState.turn = (newState.turn + 1) as TurnNumber;

    
    return GameEngine.transitionToStartPhase(newState);
  }

  
  static endGame(state: GameState): GameState {
    const newState = deepClone(state);
    newState.phase = 'gameOver';

    const p1Points = newState.player1.missionPoints;
    const p2Points = newState.player2.missionPoints;

    let winner: string;
    if (p1Points > p2Points) {
      winner = 'player1';
    } else if (p2Points > p1Points) {
      winner = 'player2';
    } else {
      
      winner = newState.edgeHolder;
    }

    const winnerPts = winner === 'player1' ? p1Points : p2Points;
    const loserPts = winner === 'player1' ? p2Points : p1Points;
    newState.log = logSystem(
      newState.log,
      newState.turn,
      'gameOver',
      'GAME_END',
      `Game over! ${winner} wins with ${winnerPts} points vs ${loserPts} points.`,
      'game.log.gameEnd',
      { winner, winnerPts, loserPts },
    );

    return newState;
  }

  
  static handleReorderEffects(state: GameState, player: PlayerID, selectedEffectId: string): GameState {
    const newState = deepClone(state);
    const effectIdx = newState.pendingEffects.findIndex((e) => e.id === selectedEffectId);
    if (effectIdx === -1) return state;

    const effect = newState.pendingEffects[effectIdx];
    if (effect.sourcePlayer !== player) return state;

    
    newState.pendingEffects.splice(effectIdx, 1);
    newState.pendingEffects.unshift(effect);

    
    const actionIdx = newState.pendingActions.findIndex((a) => a.sourceEffectId === selectedEffectId);
    if (actionIdx > 0) {
      const action = newState.pendingActions[actionIdx];
      newState.pendingActions.splice(actionIdx, 1);
      newState.pendingActions.unshift(action);
    }

    
    (newState as any).effectOrderResolved = true;

    return newState;
  }

  
  static handlePendingAction(state: GameState, player: PlayerID, action: GameAction): GameState {
    if (action.type === 'SELECT_TARGET') {
      const newState = deepClone(state);
      
      (newState as any).effectOrderResolved = false;
      const pendingAction = newState.pendingActions.find((p) => p.id === action.pendingActionId);
      if (!pendingAction) return state;
      if (pendingAction.player !== player) return state;

      
      const pendingEffect = newState.pendingEffects.find((e) => e.id === pendingAction.sourceEffectId);
      if (!pendingEffect) {
        
        newState.pendingActions = newState.pendingActions.filter((p) => p.id !== action.pendingActionId);
        return newState;
      }

      
      
      return EffectEngine.applyTargetedEffect(newState, pendingEffect, action.selectedTargets);
    }

    if (action.type === 'DECLINE_OPTIONAL_EFFECT') {
      let newState = deepClone(state);
      const effectIdx = newState.pendingEffects.findIndex((p) => p.id === action.pendingEffectId);
      if (effectIdx === -1) return state;

      const effect = newState.pendingEffects[effectIdx];
      
      
      
      
      if (!effect.isOptional && !effect.rootOptional) return state;


      if (effect.targetSelectionType === 'SASUKE014_CONFIRM_UPGRADE_MODIFIER') {
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);
        newState = EffectEngine.sasuke014QueueHandReveal(
          newState, effect.sourcePlayer, effect.sourceCardId,
          effect.sourceInstanceId, effect.sourceMissionIndex,
          effect.effectType, effect.remainingEffectTypes, false,
        );
        return newState;
      }


      if (effect.targetSelectionType === 'GAARA120_CHOOSE_DEFEAT') {
        let gDesc: { defeatedCount?: number; nextMissionIndex?: number; isUpgrade?: boolean; sourceInstanceId?: string; sourceMissionIndex?: number } = {};
        try { gDesc = JSON.parse(effect.effectDescription); } catch { /* ignore */ }
        const { defeatedCount = 0, nextMissionIndex = 0, isUpgrade = false, sourceInstanceId, sourceMissionIndex } = gDesc;

        
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);

        const enemySide_g: 'player1Characters' | 'player2Characters' =
          effect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

        
        let chainedToNext = false;
        for (let mi = nextMissionIndex; mi < newState.activeMissions.length; mi++) {
          const mission_g = newState.activeMissions[mi];
          const validTargets_g: string[] = [];
          for (const c of mission_g[enemySide_g]) {
            if (c.isHidden) {
              validTargets_g.push(c.instanceId); // hidden = power 0 ≤ 1
              continue;
            }
            const topCard = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
            const power = (topCard.power ?? 0) + c.powerTokens;
            if (power <= 1) validTargets_g.push(c.instanceId);
          }
          if (validTargets_g.length === 0) continue;

          
          const chainData = JSON.stringify({ defeatedCount, nextMissionIndex: mi + 1, isUpgrade, sourceInstanceId, sourceMissionIndex, missionIndex: mi });
          const effId = generateInstanceId();
          const actId = generateInstanceId();
          newState.pendingEffects = [...newState.pendingEffects, {
            id: effId,
            sourceCardId: effect.sourceCardId,
            sourceInstanceId: effect.sourceInstanceId,
            sourceMissionIndex: effect.sourceMissionIndex,
            effectType: effect.effectType,
            effectDescription: chainData,
            targetSelectionType: 'GAARA120_CHOOSE_DEFEAT',
            sourcePlayer: effect.sourcePlayer,
            requiresTargetSelection: true,
            validTargets: validTargets_g,
            isOptional: true,
            isMandatory: false,
            resolved: false,
            isUpgrade: effect.isUpgrade,
          }];
          newState.pendingActions = [...newState.pendingActions, {
            id: actId,
            type: 'SELECT_TARGET' as const,
            player: effect.sourcePlayer,
            description: `Gaara (120): Choose an enemy character with Power 1 or less to defeat in mission ${mi + 1}.`,
            descriptionKey: 'game.effect.desc.gaara120ChooseDefeat',
            descriptionParams: { mission: String(mi + 1) },
            options: validTargets_g,
            minSelections: 1,
            maxSelections: 1,
            sourceEffectId: effId,
          }];
          chainedToNext = true;
          break;
        }

        
        if (!chainedToNext && isUpgrade && defeatedCount > 0 && sourceInstanceId && sourceMissionIndex != null) {
          const friendlySide_g: 'player1Characters' | 'player2Characters' =
            effect.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
          const upgMissions = [...newState.activeMissions];
          const upgMission = { ...upgMissions[sourceMissionIndex] };
          const upgChars = [...upgMission[friendlySide_g]];
          const selfIdx = upgChars.findIndex((c: CharacterInPlay) => c.instanceId === sourceInstanceId);
          if (selfIdx !== -1) {
            upgChars[selfIdx] = { ...upgChars[selfIdx], powerTokens: upgChars[selfIdx].powerTokens + defeatedCount };
            upgMission[friendlySide_g] = upgChars;
            upgMissions[sourceMissionIndex] = upgMission;
            newState = { ...newState, activeMissions: upgMissions };
            newState.log = logAction(
              newState.log, newState.turn, newState.phase, effect.sourcePlayer,
              'EFFECT_POWERUP',
              `Gaara (120): POWERUP ${defeatedCount} (upgrade, from missions skipped then completed).`,
              'game.log.effect.powerupSelf',
              { card: 'GAARA', id: 'KS-120-R', amount: defeatedCount },
            );
          }
        }
        return newState;
      }

      
      if (effect.targetSelectionType === 'DOSU069_OPPONENT_CHOICE') {
        let parsed: { targetInstanceId?: string; sourcePlayer?: string } = {};
        try { parsed = JSON.parse(effect.effectDescription); } catch { /* ignore */ }
        const defeatTargetId = parsed.targetInstanceId ?? (effect.validTargets?.[0] ?? '');
        const dosuPlayer = (parsed.sourcePlayer ?? effect.sourcePlayer) as import('./types').PlayerID;
        if (defeatTargetId) {
          
          const defeated = EffectEngine.defeatCharacter(newState, defeatTargetId, dosuPlayer);
          
          defeated.pendingEffects = defeated.pendingEffects.filter((e) => e.id !== effect.id);
          defeated.pendingActions = defeated.pendingActions.filter((a) => a.sourceEffectId !== effect.id);
          defeated.log = logAction(
            defeated.log, defeated.turn, defeated.phase, dosuPlayer,
            'EFFECT_DEFEAT',
            `Dosu Kinuta (069): Hidden character was defeated (opponent chose not to reveal).`,
            'game.log.effect.dosu069DeclineDefeat',
            { card: 'DOSU KINUTA', id: 'KS-069-UC' },
          );
          if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0) {
            return EffectEngine.processRemainingEffects(defeated, effect);
          }
          return defeated;
        }
      }

      
      if (effect.targetSelectionType === 'GEMMA049_SACRIFICE_CHOICE') {
        let parsed049: { targetInstanceId?: string; effectSource?: string } = {};
        try { parsed049 = JSON.parse(effect.effectDescription); } catch { /* ignore */ }
        const defeatTargetId049 = parsed049.targetInstanceId ?? '';
        const effectSource049 = (parsed049.effectSource ?? (effect.sourcePlayer === 'player1' ? 'player2' : 'player1')) as import('./types').PlayerID;
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);
        if (defeatTargetId049) {
          const charResult049 = EffectEngine.findCharByInstanceId(newState, defeatTargetId049);
          newState = EffectEngine.defeatCharacterDirect(newState, defeatTargetId049);
          if (charResult049) {
            newState.log = logAction(
              newState.log, newState.turn, newState.phase, effectSource049,
              'EFFECT_DEFEAT', `${charResult049.character.card.name_fr} was defeated (Gemma sacrifice declined).`,
              'game.log.effect.defeat',
              { card: '???', id: '', target: charResult049.character.card.name_fr },
            );
            newState = triggerOnDefeatEffects(newState, charResult049.character, charResult049.player);
          }
        }
        if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0) {
          return EffectEngine.processRemainingEffects(newState, effect);
        }
        return newState;
      }

      
      if (effect.targetSelectionType === 'GEMMA049_SACRIFICE_HIDE_CHOICE') {
        let parsed049h: { targetInstanceId?: string; effectSource?: string; batchRemainingTargets?: string[]; batchSourcePlayer?: string } = {};
        try { parsed049h = JSON.parse(effect.effectDescription); } catch { /* ignore */ }
        const hideTargetId049 = parsed049h.targetInstanceId ?? '';
        const effectSource049h = (parsed049h.effectSource ?? (effect.sourcePlayer === 'player1' ? 'player2' : 'player1')) as import('./types').PlayerID;
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);
        if (hideTargetId049) {
          newState = EffectEngine.hideCharacter(newState, hideTargetId049);
          const charResult049h = EffectEngine.findCharByInstanceId(state, hideTargetId049);
          if (charResult049h) {
            newState.log = logAction(
              newState.log, newState.turn, newState.phase, effectSource049h,
              'EFFECT_HIDE', `${charResult049h.character.card.name_fr} was hidden (Gemma sacrifice declined).`,
              'game.log.effect.hide',
              { card: '???', id: '', target: charResult049h.character.card.name_fr, mission: String(charResult049h.missionIndex + 1) },
            );
          }
        }
        
        if (parsed049h.batchRemainingTargets && parsed049h.batchRemainingTargets.length > 0) {
          const batchPlayer = (parsed049h.batchSourcePlayer ?? effectSource049h) as import('./types').PlayerID;
          newState = EffectEngine.resumeBatchHideAfterGemma(newState, parsed049h.batchRemainingTargets, batchPlayer);
        }
        if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0) {
          return EffectEngine.processRemainingEffects(newState, effect);
        }
        return newState;
      }

      
      if (effect.targetSelectionType === 'GEMMA049_CHOOSE_PROTECT_HIDE') {
        let parsed049cp: { batchAllTargets?: string[]; batchSourcePlayer?: string } = {};
        try { parsed049cp = JSON.parse(effect.effectDescription); } catch { /* ignore */ }
        
        
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);
        
        const batchAll049 = parsed049cp.batchAllTargets ?? [];
        const batchSourceP049 = (parsed049cp.batchSourcePlayer ?? (effect.sourcePlayer === 'player1' ? 'player2' : 'player1')) as import('./types').PlayerID;
        let hiddenCount049 = 0;
        for (const bId of batchAll049) {
          newState = EffectEngine.hideCharacterWithLog(newState, bId, batchSourceP049);
          const charAfter = EffectEngine.findCharByInstanceId(newState, bId);
          if (charAfter && charAfter.character.isHidden) hiddenCount049++;
        }
        
        newState.pendingEffects = newState.pendingEffects.filter((e) => e.id !== effect.id);
        if (hiddenCount049 > 0) {
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, batchSourceP049,
            'EFFECT_HIDE',
            `Kabuto Yakushi (054): Hid ${hiddenCount049} character(s) in this mission (Gemma protection declined).`,
            'game.log.effect.hideMultiple',
            { card: 'KABUTO YAKUSHI', id: 'KS-054-UC', count: String(hiddenCount049) },
          );
        }
        return newState;
      }

      
      if (effect.targetSelectionType === 'ZABUZA087_CONFIRM_UPGRADE_MODIFIER') {
        let z087dData: { targetInstanceId?: string; missionIndex?: number } = {};
        try { z087dData = JSON.parse(effect.effectDescription); } catch { /* ignore */ }
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);

        if (z087dData.targetInstanceId) {
          const z087dTarget = EffectEngine.findCharByInstanceId(newState, z087dData.targetInstanceId);
          if (z087dTarget) {
            const z087dOpponent = effect.sourcePlayer === 'player1' ? 'player2' : 'player1';
            if (canBeHiddenByEnemy(newState, z087dTarget.character, z087dOpponent as import('./types').PlayerID)) {
              newState = EffectEngine.hideCharacterWithLog(newState, z087dData.targetInstanceId, effect.sourcePlayer);
            } else {
              newState.log = logAction(
                newState.log, newState.turn, newState.phase, effect.sourcePlayer,
                'EFFECT_NO_TARGET', `Zabuza Momochi (087): ${z087dTarget.character.card.name_fr} is immune to being hidden.`,
                'game.log.effect.immune', { card: 'ZABUZA MOMOCHI', id: 'KS-087-UC', target: z087dTarget.character.card.name_fr });
            }
          }
        }

        if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0) {
          return EffectEngine.processRemainingEffects(newState, effect);
        }
        return newState;
      }

      
      if (effect.targetSelectionType === 'HAKU089_CONFIRM_UPGRADE_MODIFIER') {
        const h089dOpponent = effect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        let h089dData: { missionIndex?: number } = {};
        try { h089dData = JSON.parse(effect.effectDescription); } catch { /* ignore */ }
        const h089dMI = h089dData.missionIndex ?? effect.sourceMissionIndex;
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);

        if (newState[h089dOpponent].deck.length === 0) {
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, effect.sourcePlayer,
            'EFFECT_NO_TARGET', "Haku (089): Opponent's deck empty. Cannot discard.",
            'game.log.effect.noTarget', { card: 'HAKU', id: 'KS-089-UC' });
        } else {
          newState = EffectEngine.haku089DiscardAndPowerup(newState, effect as any, h089dOpponent as import('./types').PlayerID, h089dMI);
        }

        if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0) {
          return EffectEngine.processRemainingEffects(newState, effect);
        }
        return newState;
      }

      

      
      if (effect.targetSelectionType === 'ITACHI091_CONFIRM_UPGRADE_MODIFIER') {
        const i091dOpponent = effect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);

        const i091dOppHand = newState[i091dOpponent].hand;
        if (i091dOppHand.length > 0) {
          const i091dCards = i091dOppHand.map((c: any, i: number) => ({
            name_fr: c.name_fr, chakra: c.chakra ?? 0, power: c.power ?? 0,
            image_file: c.image_file, originalIndex: i,
          }));
          const i091dEffId = generateInstanceId();
          const i091dActId = generateInstanceId();
          newState.pendingEffects.push({
            id: i091dEffId, sourceCardId: effect.sourceCardId,
            sourceInstanceId: effect.sourceInstanceId,
            sourceMissionIndex: effect.sourceMissionIndex,
            effectType: effect.effectType,
            effectDescription: JSON.stringify({ isUpgrade: false }),
            targetSelectionType: 'ITACHI091_HAND_REVEAL',
            sourcePlayer: effect.sourcePlayer, requiresTargetSelection: true,
            validTargets: ['confirm'],
            isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: i091dActId, type: 'SELECT_TARGET' as any,
            player: effect.sourcePlayer,
            description: JSON.stringify({ text: 'Itachi Uchiwa (091) MAIN: Opponent hand revealed.', cards: i091dCards }),
            descriptionKey: 'game.effect.desc.itachi091HandReveal',
            options: ['confirm'], minSelections: 1, maxSelections: 1,
            sourceEffectId: i091dEffId,
          });
        }

        if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0) {
          return EffectEngine.processRemainingEffects(newState, effect);
        }
        return newState;
      }

      
      if (effect.targetSelectionType === 'KISAME093_CONFIRM_UPGRADE_MODIFIER') {
        const k093dEnemySide: 'player1Characters' | 'player2Characters' =
          effect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);

        const k093dValidTargets: string[] = [];
        for (const m of newState.activeMissions) {
          for (const c of m[k093dEnemySide]) {
            if (c.powerTokens > 0) k093dValidTargets.push(c.instanceId);
          }
        }
        if (k093dValidTargets.length > 0) {
          const k093dEffId = generateInstanceId();
          const k093dActId = generateInstanceId();
          newState.pendingEffects.push({
            id: k093dEffId, sourceCardId: effect.sourceCardId,
            sourceInstanceId: effect.sourceInstanceId,
            sourceMissionIndex: effect.sourceMissionIndex,
            effectType: effect.effectType,
            effectDescription: '', targetSelectionType: 'STEAL_POWER_TOKENS_ENEMY_IN_PLAY',
            sourcePlayer: effect.sourcePlayer, requiresTargetSelection: true,
            validTargets: k093dValidTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: k093dActId, type: 'SELECT_TARGET' as any,
            player: effect.sourcePlayer,
            description: 'Kisame Hoshigaki (093): Choose an enemy character to steal Power tokens from.',
            descriptionKey: 'game.effect.desc.kisame093StealTarget',
            options: k093dValidTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: k093dEffId,
          });
        }

        if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0) {
          return EffectEngine.processRemainingEffects(newState, effect);
        }
        return newState;
      }

      
      if (effect.targetSelectionType === 'KAKASHI106_CONFIRM_UPGRADE_MODIFIER') {
        const k106dEnemySide: 'player1Characters' | 'player2Characters' =
          effect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);

        const k106dValidTargets: string[] = [];
        for (const m of newState.activeMissions) {
          for (const c of m[k106dEnemySide]) {
            if (c.stack?.length > 1) k106dValidTargets.push(c.instanceId);
          }
        }
        if (k106dValidTargets.length > 0) {
          const k106dEffId = generateInstanceId();
          const k106dActId = generateInstanceId();
          newState.pendingEffects.push({
            id: k106dEffId, sourceCardId: effect.sourceCardId,
            sourceInstanceId: effect.sourceInstanceId,
            sourceMissionIndex: effect.sourceMissionIndex,
            effectType: effect.effectType,
            effectDescription: '', targetSelectionType: 'KAKASHI106_DEVOLVE_TARGET',
            sourcePlayer: effect.sourcePlayer, requiresTargetSelection: true,
            validTargets: k106dValidTargets, isOptional: true, isMandatory: false,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: k106dActId, type: 'SELECT_TARGET' as any,
            player: effect.sourcePlayer,
            description: 'Kakashi Hatake (106): Choose an upgraded enemy character to de-evolve.',
            descriptionKey: 'game.effect.desc.kakashi106DevolveTarget',
            options: k106dValidTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: k106dEffId,
          });
        }

        if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0) {
          return EffectEngine.processRemainingEffects(newState, effect);
        }
        return newState;
      }

      
      if (effect.targetSelectionType === 'NARUTO108_CONFIRM_UPGRADE_MODIFIER') {
        let n108dData: { missionIndex?: number } = {};
        try { n108dData = JSON.parse(effect.effectDescription); } catch { /* ignore */ }
        const n108dMI = n108dData.missionIndex ?? effect.sourceMissionIndex;
        const n108dOpponent = effect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);

        const n108dMission = newState.activeMissions[n108dMI];
        if (n108dMission) {
          const n108dEnemySide = n108dOpponent === 'player1' ? 'player1Characters' : 'player2Characters';
          const n108dValidTargets = n108dMission[n108dEnemySide]
            .filter((c: any) => !c.isHidden && getEffectivePower(newState, c, n108dOpponent) <= 3)
            .map((c: any) => c.instanceId);
          if (n108dValidTargets.length > 0) {
            const n108dEffId = generateInstanceId();
            const n108dActId = generateInstanceId();
            newState.pendingEffects.push({
              id: n108dEffId, sourceCardId: effect.sourceCardId,
              sourceInstanceId: effect.sourceInstanceId,
              sourceMissionIndex: n108dMI,
              effectType: effect.effectType,
              effectDescription: JSON.stringify({ isUpgrade: false }),
              targetSelectionType: 'NARUTO108_CHOOSE_HIDE_TARGET',
              sourcePlayer: effect.sourcePlayer, requiresTargetSelection: true,
              validTargets: n108dValidTargets, isOptional: false, isMandatory: true,
              resolved: false, isUpgrade: false,
            });
            newState.pendingActions.push({
              id: n108dActId, type: 'SELECT_TARGET' as any,
              player: effect.sourcePlayer,
              description: 'Naruto Uzumaki (108): Choose an enemy with Power 3 or less to hide.',
              descriptionKey: 'game.effect.desc.naruto108ChooseHideTarget',
              options: n108dValidTargets, minSelections: 1, maxSelections: 1,
              sourceEffectId: n108dEffId,
            });
          }
        }

        if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0) {
          return EffectEngine.processRemainingEffects(newState, effect);
        }
        return newState;
      }

      
      if (effect.targetSelectionType === 'SAKURA109_CONFIRM_UPGRADE_MODIFIER') {
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);

        const s109dPS = newState[effect.sourcePlayer];
        const s109dValidTargets = s109dPS.discardPile
          .map((c: any, i: number) => ({ c, i }))
          .filter(({ c }: any) => c.card_type === 'character' && c.group === 'Leaf Village' && s109dPS.chakra >= (c.chakra ?? 0))
          .map(({ i }: any) => String(i));
        if (s109dValidTargets.length > 0) {
          const s109dEffId = generateInstanceId();
          const s109dActId = generateInstanceId();
          newState.pendingEffects.push({
            id: s109dEffId, sourceCardId: effect.sourceCardId,
            sourceInstanceId: effect.sourceInstanceId,
            sourceMissionIndex: effect.sourceMissionIndex,
            effectType: effect.effectType,
            effectDescription: '', targetSelectionType: 'SAKURA109_CHOOSE_DISCARD',
            sourcePlayer: effect.sourcePlayer, requiresTargetSelection: true,
            validTargets: s109dValidTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: s109dActId, type: 'CHOOSE_CARD_FROM_LIST' as any,
            player: effect.sourcePlayer,
            description: 'Sakura Haruno (109): Choose a Leaf Village character from your discard pile to play.',
            descriptionKey: 'game.effect.desc.sakura109ChooseDiscard',
            options: s109dValidTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: s109dEffId,
          });
        } else {
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, effect.sourcePlayer,
            'EFFECT_NO_TARGET', 'Sakura Haruno (109): No affordable Leaf Village character in discard.',
            'game.log.effect.noTarget', { card: 'SAKURA HARUNO', id: 'KS-109-R' });
        }

        if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0) {
          return EffectEngine.processRemainingEffects(newState, effect);
        }
        return newState;
      }

      
      if (effect.targetSelectionType === 'INO110_CONFIRM_UPGRADE_MODIFIER') {
        let i110dData: { missionIndex?: number } = {};
        try { i110dData = JSON.parse(effect.effectDescription); } catch { /* ignore */ }
        const i110dMI = i110dData.missionIndex ?? effect.sourceMissionIndex;
        const i110dOpponent = effect.sourcePlayer === 'player1' ? 'player2' : 'player1';
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);

        const i110dMission = newState.activeMissions[i110dMI];
        if (i110dMission) {
          const i110dEnemySide = i110dOpponent === 'player1' ? 'player1Characters' : 'player2Characters';
          const i110dEnemies = i110dMission[i110dEnemySide];
          if (i110dEnemies.length >= 2) {
            const i110dNonHidden = i110dEnemies.filter((c: any) => !c.isHidden);
            if (i110dNonHidden.length > 0) {
              let i110dMinPower = Infinity;
              for (const c of i110dNonHidden) {
                const p = getEffectivePower(newState, c, i110dOpponent);
                if (p < i110dMinPower) i110dMinPower = p;
              }
              const i110dWeakest = i110dNonHidden
                .filter((c: any) => getEffectivePower(newState, c, i110dOpponent) === i110dMinPower)
                .map((c: any) => c.instanceId);
              if (i110dWeakest.length > 0) {
                const i110dEffId = generateInstanceId();
                const i110dActId = generateInstanceId();
                newState.pendingEffects.push({
                  id: i110dEffId, sourceCardId: effect.sourceCardId,
                  sourceInstanceId: effect.sourceInstanceId,
                  sourceMissionIndex: i110dMI,
                  effectType: effect.effectType,
                  effectDescription: '', targetSelectionType: 'INO110_CHOOSE_ENEMY',
                  sourcePlayer: effect.sourcePlayer, requiresTargetSelection: true,
                  validTargets: i110dWeakest, isOptional: false, isMandatory: true,
                  resolved: false, isUpgrade: false,
                });
                newState.pendingActions.push({
                  id: i110dActId, type: 'SELECT_TARGET' as any,
                  player: effect.sourcePlayer,
                  description: 'Ino Yamanaka (110): Choose the weakest enemy to move.',
                  descriptionKey: 'game.effect.desc.ino110ChooseEnemy',
                  options: i110dWeakest, minSelections: 1, maxSelections: 1,
                  sourceEffectId: i110dEffId,
                });
              }
            }
          }
        }

        if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0) {
          return EffectEngine.processRemainingEffects(newState, effect);
        }
        return newState;
      }

      
      if (effect.targetSelectionType === 'KIDOMARU124_CONFIRM_UPGRADE_MODIFIER') {
        let k124dData: { sourceMissionIndex?: number } = {};
        try { k124dData = JSON.parse(effect.effectDescription); } catch { /* ignore */ }
        const k124dPlayer = effect.sourcePlayer;
        const k124dLimit = 3;
        const k124dEnemySide: 'player1Characters' | 'player2Characters' =
          k124dPlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const k124dOpponent = k124dPlayer === 'player1' ? 'player2' as const : 'player1' as const;
        const k124dSrcMission = k124dData.sourceMissionIndex ?? effect.sourceMissionIndex;
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a: any) => a.sourceEffectId !== effect.id);

        const k124dTargets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          if (i === k124dSrcMission) continue;
          for (const c of newState.activeMissions[i][k124dEnemySide]) {
            if (getEffectivePower(newState, c, k124dOpponent) <= k124dLimit) {
              k124dTargets.push(c.instanceId);
            }
          }
        }
        if (k124dTargets.length === 1) {
          newState = EffectEngine.defeatCharacter(newState, k124dTargets[0], k124dPlayer);
        } else if (k124dTargets.length > 1) {
          const k124dEffId = generateInstanceId();
          const k124dActId = generateInstanceId();
          newState.pendingEffects.push({
            id: k124dEffId, sourceCardId: effect.sourceCardId,
            sourceInstanceId: effect.sourceInstanceId,
            sourceMissionIndex: effect.sourceMissionIndex, effectType: effect.effectType,
            effectDescription: '', targetSelectionType: 'KIDOMARU124_DEFEAT_TARGET',
            sourcePlayer: k124dPlayer, requiresTargetSelection: true,
            validTargets: k124dTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          });
          newState.pendingActions.push({
            id: k124dActId, type: 'SELECT_TARGET' as any,
            player: k124dPlayer,
            description: 'Kidomaru (124) AMBUSH: Choose an enemy with Power 3 or less to defeat.',
            descriptionKey: 'game.effect.desc.kidomaru124Defeat',
            options: k124dTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: k124dEffId,
          });
        }

        if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0) {
          return EffectEngine.processRemainingEffects(newState, effect);
        }
        return newState;
      }

      
      if (effect.targetSelectionType === 'NARUTO133_CONFIRM_UPGRADE_MODIFIER') {
        let n133dData: { missionIndex?: number } = {};
        try { n133dData = JSON.parse(effect.effectDescription); } catch { /* ignore */ }
        const n133dPlayer = effect.sourcePlayer;
        const n133dOpponent: import('./types').PlayerID = n133dPlayer === 'player1' ? 'player2' : 'player1';
        const n133dEnemySide: 'player1Characters' | 'player2Characters' =
          n133dPlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const n133dMI = n133dData.missionIndex ?? effect.sourceMissionIndex;
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);

        const n133dMission = newState.activeMissions[n133dMI];
        if (n133dMission) {
          const n133dValidT1 = n133dMission[n133dEnemySide]
            .filter((c: any) => !c.isHidden && getEffectivePower(newState, c, n133dOpponent) <= 5)
            .map((c: any) => c.instanceId);
          const n133dValidT2: string[] = [];
          for (let i = 0; i < newState.activeMissions.length; i++) {
            for (const ch of newState.activeMissions[i][n133dEnemySide]) {
              if (!ch.isHidden && getEffectivePower(newState, ch, n133dOpponent) <= 2) {
                n133dValidT2.push(ch.instanceId);
              }
            }
          }

          if (n133dValidT1.length > 0) {
            const n133dEffId = generateInstanceId();
            const n133dActId = generateInstanceId();
            newState.pendingEffects.push({
              id: n133dEffId, sourceCardId: effect.sourceCardId,
              sourceInstanceId: effect.sourceInstanceId,
              sourceMissionIndex: n133dMI, effectType: effect.effectType,
              effectDescription: JSON.stringify({ missionIndex: n133dMI, useDefeat: false }),
              targetSelectionType: 'NARUTO133_CHOOSE_TARGET1',
              sourcePlayer: n133dPlayer, requiresTargetSelection: true,
              validTargets: n133dValidT1, isOptional: false, isMandatory: true,
              resolved: false, isUpgrade: false,
              remainingEffectTypes: effect.remainingEffectTypes,
            });
            newState.pendingActions.push({
              id: n133dActId, type: 'SELECT_TARGET' as any,
              player: n133dPlayer,
              description: 'Naruto Uzumaki (133): Choose an enemy with Power 5 or less to hide (this mission).',
              descriptionKey: 'game.effect.desc.naruto133ChooseHide1',
              options: n133dValidT1, minSelections: 1, maxSelections: 1,
              sourceEffectId: n133dEffId,
            });
          } else if (n133dValidT2.length > 0) {
            const n133dEffId2 = generateInstanceId();
            const n133dActId2 = generateInstanceId();
            newState.pendingEffects.push({
              id: n133dEffId2, sourceCardId: effect.sourceCardId,
              sourceInstanceId: effect.sourceInstanceId,
              sourceMissionIndex: n133dMI, effectType: effect.effectType,
              effectDescription: JSON.stringify({ useDefeat: false, target1Id: null }),
              targetSelectionType: 'NARUTO133_CHOOSE_TARGET2',
              sourcePlayer: n133dPlayer, requiresTargetSelection: true,
              validTargets: n133dValidT2, isOptional: false, isMandatory: true,
              resolved: false, isUpgrade: false,
              remainingEffectTypes: effect.remainingEffectTypes,
            });
            newState.pendingActions.push({
              id: n133dActId2, type: 'SELECT_TARGET' as any,
              player: n133dPlayer,
              description: 'Naruto Uzumaki (133): Choose an enemy with Power 2 or less to hide (any mission).',
              descriptionKey: 'game.effect.desc.naruto133ChooseHide2',
              options: n133dValidT2, minSelections: 1, maxSelections: 1,
              sourceEffectId: n133dEffId2,
            });
          }
        }

        if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0 && !newState.pendingEffects.some((e) => e.remainingEffectTypes)) {
          return EffectEngine.processRemainingEffects(newState, effect);
        }
        return newState;
      }

      
      if (effect.targetSelectionType === 'SAKURA135_CONFIRM_UPGRADE_MODIFIER') {
        
        const s135dPlayer = effect.sourcePlayer;
        const s135dPs = newState[s135dPlayer];
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);

        if (s135dPs.deck.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, s135dPlayer,
            'EFFECT_NO_TARGET', 'Sakura Haruno (135): Deck is empty.',
            'game.log.effect.noTarget', { card: 'SAKURA HARUNO', id: 'KS-135-S' });
          return newState;
        }

        
        const s135dDeck = [...s135dPs.deck];
        const s135dTop3 = s135dDeck.splice(0, Math.min(3, s135dDeck.length));
        newState = { ...newState, [s135dPlayer]: { ...s135dPs, deck: s135dDeck } };

        
        const s135dAvailable = s135dTop3.filter((card) => {
          if (card.card_type !== 'character') return false;
          return (card.chakra ?? 0) <= newState[s135dPlayer].chakra;
        });

        if (s135dAvailable.length === 0) {
          newState = { ...newState, [s135dPlayer]: { ...newState[s135dPlayer], discardPile: [...newState[s135dPlayer].discardPile, ...s135dTop3] } };
          newState.log = logAction(newState.log, newState.turn, newState.phase, s135dPlayer,
            'EFFECT_NO_TARGET', 'Sakura Haruno (135): No affordable characters in top 3, all discarded.',
            'game.log.effect.noTarget', { card: 'SAKURA HARUNO', id: 'KS-135-S' });
          return newState;
        }

        
        newState = { ...newState, [s135dPlayer]: { ...newState[s135dPlayer], discardPile: [...newState[s135dPlayer].discardPile, ...s135dTop3] } };

        const s135dEffId = generateInstanceId();
        const s135dActId = generateInstanceId();
        const s135dValidIndices = s135dTop3
          .map((c, i) => ({ card: c, index: i }))
          .filter(({ card }) => s135dAvailable.some((a) => a.id === card.id))
          .map(({ index }) => String(index));

        newState.pendingEffects.push({
          id: s135dEffId, sourceCardId: effect.sourceCardId,
          sourceInstanceId: effect.sourceInstanceId,
          sourceMissionIndex: effect.sourceMissionIndex, effectType: effect.effectType,
          effectDescription: JSON.stringify({
            topCards: s135dTop3.map((c, i) => ({
              index: i, name: c.name_fr, chakra: c.chakra ?? 0, power: c.power ?? 0, isCharacter: c.card_type === 'character',
            })),
            costReduction: 0,
          }),
          targetSelectionType: 'SAKURA135_CHOOSE_CARD',
          sourcePlayer: s135dPlayer, requiresTargetSelection: true,
          validTargets: s135dValidIndices, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: false,
          remainingEffectTypes: effect.remainingEffectTypes,
        });
        newState.pendingActions.push({
          id: s135dActId, type: 'CHOOSE_CARD_FROM_LIST' as any,
          player: s135dPlayer,
          description: 'Sakura Haruno (135): Choose a character from top 3 to play.',
          descriptionKey: 'game.effect.desc.sakura135ChooseCard',
          options: s135dValidIndices, minSelections: 1, maxSelections: 1,
          sourceEffectId: s135dEffId,
        });
        return newState;
      }

      
      if (effect.targetSelectionType === 'GAARA139_CONFIRM_UPGRADE_MODIFIER') {
        const g139dPlayer = effect.sourcePlayer;
        const g139dEnemySide: 'player1Characters' | 'player2Characters' =
          g139dPlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const g139dFriendlySide: 'player1Characters' | 'player2Characters' =
          g139dPlayer === 'player1' ? 'player1Characters' : 'player2Characters';
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);

        
        let g139dHiddenCount = 0;
        for (const mission of newState.activeMissions) {
          for (const char of mission[g139dFriendlySide]) {
            if (char.isHidden) g139dHiddenCount++;
          }
        }

        if (g139dHiddenCount === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, g139dPlayer,
            'EFFECT_NO_TARGET', 'Gaara (139): No friendly hidden characters (state changed).',
            'game.log.effect.noTarget', { card: 'GAARA', id: 'KS-139-S' });
          return newState;
        }

        
        const g139dValidTargets: string[] = [];
        for (let i = 0; i < newState.activeMissions.length; i++) {
          for (const char of newState.activeMissions[i][g139dEnemySide]) {
            const topCard = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
            const effectiveCost = char.isHidden ? 0 : topCard.chakra;
            if (effectiveCost < g139dHiddenCount) {
              g139dValidTargets.push(char.instanceId);
            }
          }
        }

        if (g139dValidTargets.length === 0) {
          newState.log = logAction(newState.log, newState.turn, newState.phase, g139dPlayer,
            'EFFECT_NO_TARGET', `Gaara (139): No enemy with cost less than ${g139dHiddenCount} (state changed).`,
            'game.log.effect.noTarget', { card: 'GAARA', id: 'KS-139-S' });
          return newState;
        }

        const g139dEffId = generateInstanceId();
        const g139dActId = generateInstanceId();
        newState.pendingEffects.push({
          id: g139dEffId, sourceCardId: effect.sourceCardId,
          sourceInstanceId: effect.sourceInstanceId,
          sourceMissionIndex: effect.sourceMissionIndex, effectType: effect.effectType,
          effectDescription: JSON.stringify({ useHideSameName: false }),
          targetSelectionType: 'GAARA139_DEFEAT_BY_COST',
          sourcePlayer: g139dPlayer, requiresTargetSelection: true,
          validTargets: g139dValidTargets, isOptional: false, isMandatory: true,
          resolved: false, isUpgrade: true,
          remainingEffectTypes: effect.remainingEffectTypes,
        });
        newState.pendingActions.push({
          id: g139dActId, type: 'SELECT_TARGET' as any,
          player: g139dPlayer,
          description: `Gaara (139) MAIN: Choose an enemy with cost less than ${g139dHiddenCount} to defeat.`,
          descriptionKey: 'game.effect.desc.gaara139DefeatByCost',
          descriptionParams: { count: String(g139dHiddenCount) },
          options: g139dValidTargets, minSelections: 1, maxSelections: 1,
          sourceEffectId: g139dEffId,
        });
        return newState;
      }

      
      if (effect.targetSelectionType === 'KIBA113_CONFIRM_UPGRADE' || effect.targetSelectionType === 'KIBA149_CONFIRM_UPGRADE') {
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);

        if (effect.targetSelectionType === 'KIBA149_CONFIRM_UPGRADE') {
          newState = EffectEngine.kiba149ExecuteStep1(newState, effect, false);
        } else {
          newState = EffectEngine.kiba113QueueAkamaruChoice(newState, effect, false);
        }

        if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0) {
          return EffectEngine.processRemainingEffects(newState, effect);
        }
        return newState;
      }

      
      if (effect.targetSelectionType === 'GIANT_SPIDER103_CHOOSE_HIDE_TARGET') {
        let k103Data: { giantSpiderInstanceId?: string } = {};
        try { k103Data = JSON.parse(effect.effectDescription); } catch { /* ignore */ }
        if (k103Data.giantSpiderInstanceId) {
          newState = returnCharacterToHand(newState, k103Data.giantSpiderInstanceId, effect.sourcePlayer);
          newState.log = logAction(
            newState.log, newState.turn, newState.phase, effect.sourcePlayer,
            'END_RETURN',
            'Giant Spider (103): Returns to hand at end of round.',
            'game.log.effect.giantSpider103Return',
            { card: 'ARAIGNEE GEANTE', id: 'KS-103-UC' },
          );
        }
      }

      
      if (effect.targetSelectionType === 'HIRUZEN002_CONFIRM_UPGRADE') {
        delete (newState as any)._hiruzen002PlayedCharId;
      }

      
      if (effect.targetSelectionType === 'KAKASHI016_CONFIRM_UPGRADE') {
        const enemySide016d: 'player1Characters' | 'player2Characters' =
          effect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
        const k016dTargets: string[] = [];
        for (const mission of newState.activeMissions) {
          for (const char of mission[enemySide016d]) {
            if (char.isHidden) continue;
            const topCard = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
            if (topCard.chakra > 4) continue;
            const hasInstant = topCard.effects?.some((eff: { type: string; description: string }) => {
              if (!isCopyableEffectType(eff.type)) return false;
              if (eff.description.includes('[⧗]')) return false;
              if (/(?:^|\s)(?:MAIN|AMBUSH|UPGRADE|SCORE)\s+effect\b/.test(eff.description)) return false;
              return true;
            });
            if (hasInstant) k016dTargets.push(char.instanceId);
          }
        }
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);
        if (k016dTargets.length > 0) {
          const k016dEffId = generateInstanceId();
          const k016dActId = generateInstanceId();
          newState.pendingEffects = [...newState.pendingEffects, {
            id: k016dEffId, sourceCardId: effect.sourceCardId,
            sourceInstanceId: effect.sourceInstanceId,
            sourceMissionIndex: effect.sourceMissionIndex,
            effectType: 'MAIN',
            effectDescription: '', targetSelectionType: 'KAKASHI_COPY_EFFECT',
            sourcePlayer: effect.sourcePlayer, requiresTargetSelection: true,
            validTargets: k016dTargets, isOptional: false, isMandatory: true,
            resolved: false, isUpgrade: false,
          }];
          newState.pendingActions = [...newState.pendingActions, {
            id: k016dActId, type: 'SELECT_TARGET' as const,
            player: effect.sourcePlayer,
            description: 'Select an enemy character (cost 4 or less) to copy their effect.',
            descriptionKey: 'game.effect.desc.kakashi016CopyEffect',
            descriptionParams: { costLimit: 'cost 4 or less' },
            options: k016dTargets, minSelections: 1, maxSelections: 1,
            sourceEffectId: k016dEffId,
          }];
        }
        return newState;
      }

      
      if (effect.targetSelectionType === 'INO020_CONFIRM_UPGRADE') {
        const i020dSrcChar = EffectEngine.findCharByInstanceId(newState, effect.sourceInstanceId ?? '');
        const i020dMIdx = i020dSrcChar?.missionIndex ?? effect.sourceMissionIndex;
        const mission020d = newState.activeMissions[i020dMIdx];
        newState.pendingEffects.splice(effectIdx, 1);
        newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);
        if (mission020d) {
          const enemySide020d: 'player1Characters' | 'player2Characters' =
            effect.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';
          const friendlySide020d: 'player1Characters' | 'player2Characters' =
            effect.sourcePlayer === 'player1' ? 'player1Characters' : 'player2Characters';
          const friendlyNames020d = new Set(
            mission020d[friendlySide020d].filter((c: any) => !c.isHidden).map((c: any) => c.card.name_fr.toUpperCase())
          );
          const i020dTargets: string[] = [];
          for (const char of mission020d[enemySide020d]) {
            const topCard = char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
            const effectiveCost = char.isHidden ? 0 : topCard.chakra;
            if (effectiveCost <= 2) {
              if (!char.isHidden && friendlyNames020d.has(char.card.name_fr.toUpperCase())) continue;
              i020dTargets.push(char.instanceId);
            }
          }
          if (i020dTargets.length > 0) {
            const i020dEffId = generateInstanceId();
            const i020dActId = generateInstanceId();
            newState.pendingEffects = [...newState.pendingEffects, {
              id: i020dEffId, sourceCardId: effect.sourceCardId,
              sourceInstanceId: effect.sourceInstanceId,
              sourceMissionIndex: i020dMIdx,
              effectType: 'MAIN',
              effectDescription: '', targetSelectionType: 'TAKE_CONTROL_ENEMY_THIS_MISSION',
              sourcePlayer: effect.sourcePlayer, requiresTargetSelection: true,
              validTargets: i020dTargets, isOptional: false, isMandatory: true,
              resolved: false, isUpgrade: false,
            }];
            newState.pendingActions = [...newState.pendingActions, {
              id: i020dActId, type: 'SELECT_TARGET' as const,
              player: effect.sourcePlayer,
              description: 'Select an enemy character with cost 2 or less to take control of.',
              descriptionKey: 'game.effect.desc.ino020TakeControl',
              descriptionParams: { costLimit: '2' },
              options: i020dTargets, minSelections: 1, maxSelections: 1,
              sourceEffectId: i020dEffId,
            }];
          }
        }
        return newState;
      }

      
      newState.pendingEffects.splice(effectIdx, 1);
      newState.pendingActions = newState.pendingActions.filter((a) => a.sourceEffectId !== effect.id);

      
      if (effect.remainingEffectTypes && effect.remainingEffectTypes.length > 0) {
        return EffectEngine.processRemainingEffects(newState, effect);
      }

      return newState;
    }

    return state;
  }

  
  static getValidActions(state: GameState, player: PlayerID): GameAction[] {
    switch (state.phase) {
      case 'mulligan': {
        const ps = state[player];
        if (ps.hasMulliganed) return [];
        return [
          { type: 'MULLIGAN', doMulligan: true },
          { type: 'MULLIGAN', doMulligan: false },
        ];
      }

      case 'action': {
        
        const pendingForPlayer = state.pendingActions.filter((p) => p.player === player);
        if (pendingForPlayer.length > 0) {
          const actions: GameAction[] = [];
          for (const p of pendingForPlayer) {
            for (const opt of p.options) {
              actions.push({
                type: 'SELECT_TARGET' as const,
                pendingActionId: p.id,
                selectedTargets: [opt],
              });
            }
          }
          
          const pendingEffects = state.pendingEffects.filter(
            (e) => e.sourcePlayer === player && e.isOptional && !e.resolved,
          );
          for (const e of pendingEffects) {
            actions.push({
              type: 'DECLINE_OPTIONAL_EFFECT' as const,
              pendingEffectId: e.id,
            });
          }
          return actions;
        }
        
        
        if (state.pendingActions.length > 0) {
          return []; // Someone needs to resolve pending actions first
        }
        
        return getValidActionsForPlayer(state, player);
      }

      case 'mission':
      case 'end': {
        
        const actions: GameAction[] = state.pendingActions
          .filter((p) => p.player === player)
          .flatMap((p) => {
            return p.options.map((opt) => ({
              type: 'SELECT_TARGET' as const,
              pendingActionId: p.id,
              selectedTargets: [opt],
            }));
          });
        
        const pendingEffects = state.pendingEffects.filter(
          (e) => e.sourcePlayer === player && e.isOptional && !e.resolved,
        );
        for (const e of pendingEffects) {
          actions.push({
            type: 'DECLINE_OPTIONAL_EFFECT' as const,
            pendingEffectId: e.id,
          });
        }
        return actions;
      }

      default:
        return [];
    }
  }

  
  static getVisibleState(state: GameState, player: PlayerID): VisibleGameState {
    const otherPlayer: PlayerID = player === 'player1' ? 'player2' : 'player1';
    const myState = state[player];
    const oppState = state[otherPlayer];

    
    const lastPlayedIds = new Set<string>(state.turnPlayedIds ?? []);

    const opponentVisible: VisibleOpponentState = {
      id: otherPlayer,
      handSize: oppState.hand.length,
      deckSize: oppState.deck.length,
      discardPileSize: oppState.discardPile.length,
      discardPile: oppState.discardPile,  // Public information per rules
      chakra: oppState.chakra,
      missionPoints: oppState.missionPoints,
      hasPassed: oppState.hasPassed,
      charactersInPlay: oppState.charactersInPlay,
    };

    const visibleMissions: VisibleMission[] = state.activeMissions.map((mission, mIdx) => {
      const makeVisible = (chars: CharacterInPlay[], side: PlayerID): VisibleCharacter[] =>
        chars.map((c) => {
          const isOwn = c.controlledBy === player;
          
          const canSee = isOwn || !c.isHidden || c.wasRevealedAtLeastOnce;
          let power = 0;
          try { power = calculateCharacterPower(state, c, side); } catch { /* prevent crash */ }
          const topCard = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
          
          let tokensZeroed = false;
          try { tokensZeroed = isRempartZeroed(state, mIdx, c, side); } catch { /* prevent crash */ }
          return {
            instanceId: c.instanceId,
            isHidden: c.isHidden,
            wasRevealedAtLeastOnce: c.wasRevealedAtLeastOnce,
            isOwn,
            card: canSee ? c.card : undefined,
            topCard: canSee ? topCard : undefined,
            powerTokens: tokensZeroed ? 0 : c.powerTokens,
            controlledBy: c.controlledBy,
            originalOwner: c.originalOwner,
            missionIndex: c.missionIndex,
            stackSize: c.stack?.length ?? 0,
            effectivePower: power,
            isLastPlayed: lastPlayedIds.has(c.instanceId),
          };
        });

      return {
        ...mission,
        player1Characters: makeVisible(mission.player1Characters, 'player1'),
        player2Characters: makeVisible(mission.player2Characters, 'player2'),
      };
    });

    return {
      gameId: state.gameId,
      gameMode: state.gameMode,
      turn: state.turn,
      phase: state.phase,
      activePlayer: state.activePlayer,
      edgeHolder: state.edgeHolder,
      edgeLockedFor: state.edgeLockedFor ?? null,
      firstPasser: state.firstPasser,
      myPlayer: player,
      myState: deepClone(myState),
      opponentState: opponentVisible,
      activeMissions: visibleMissions,
      missionDeckSize: state.missionDeck.length,
      log: state.log,
      pendingEffects: state.pendingEffects.filter(
        (e) => e.sourcePlayer === player || e.selectingPlayer === player || !e.requiresTargetSelection,
      ),
      pendingActions: state.pendingActions.filter((a) => a.player === player),
      effectOrderResolved: (state as any).effectOrderResolved ?? false,
      forfeitedBy: state.forfeitedBy,
    };
  }

  
  static getWinner(state: GameState): PlayerID | null {
    if (state.phase !== 'gameOver') return null;

    
    if (state.forfeitedBy) {
      return state.forfeitedBy === 'player1' ? 'player2' : 'player1';
    }

    const p1Points = state.player1.missionPoints;
    const p2Points = state.player2.missionPoints;

    if (p1Points > p2Points) return 'player1';
    if (p2Points > p1Points) return 'player2';
    return state.edgeHolder; // Tie goes to edge holder
  }

  
  static countCharactersInPlay(state: GameState, player: PlayerID): number {
    let count = 0;
    for (const mission of state.activeMissions) {
      const chars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
      count += chars.length;
    }
    return count;
  }

  
  static getPlayerCharacters(state: GameState, player: PlayerID): CharacterInPlay[] {
    const chars: CharacterInPlay[] = [];
    for (const mission of state.activeMissions) {
      const missionChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
      chars.push(...missionChars);
    }
    return chars;
  }

  
  static findCharacterByInstanceId(
    state: GameState,
    instanceId: string,
  ): { character: CharacterInPlay; missionIndex: number; player: PlayerID } | null {
    for (let i = 0; i < state.activeMissions.length; i++) {
      const mission = state.activeMissions[i];
      for (const char of mission.player1Characters) {
        if (char.instanceId === instanceId) {
          return { character: char, missionIndex: i, player: 'player1' };
        }
      }
      for (const char of mission.player2Characters) {
        if (char.instanceId === instanceId) {
          return { character: char, missionIndex: i, player: 'player2' };
        }
      }
    }
    return null;
  }
}
