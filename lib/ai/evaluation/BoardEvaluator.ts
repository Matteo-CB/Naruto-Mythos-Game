

import type { GameState, PlayerID, CharacterInPlay, ActiveMission } from '../../engine/types';
import { calculateCharacterPower } from '../../engine/phases/PowerCalculation';
import { MissionEvaluator } from './MissionEvaluator';
import { ChakraEvaluator } from './ChakraEvaluator';
import { getCardTier, evaluateHandSynergies, evaluateBoardSynergies, hasUpgradeTarget, isSummon, evaluateCardSynergies } from './CardTiers';
import { pointsGagnesEnRemportant } from '@/lib/effects/missions/ssMissions';



function getMyChars(mission: ActiveMission, player: PlayerID): CharacterInPlay[] {
  return player === 'player1' ? mission.player1Characters : mission.player2Characters;
}

function getOppChars(mission: ActiveMission, player: PlayerID): CharacterInPlay[] {
  return player === 'player1' ? mission.player2Characters : mission.player1Characters;
}

function topCard(c: CharacterInPlay) {
  return c.stack?.length > 0 ? c.stack[c.stack?.length - 1] : c.card;
}



export class BoardEvaluator {
  
  static evaluate(state: GameState, player: PlayerID): number {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';
    const turn = state.turn ?? 1;

    
    
    
    const w = {
      missionPoints:    100,
      missionControl:   25 + turn * 10,
      boardPresence:    20 + turn * 2,
      chakraAdvantage:  turn <= 2 ? 6 : 2,
      handSize:         turn <= 2 ? 3 : 1,
      handQuality:      turn <= 2 ? 3 : 1,
      hiddenThreats:    5,
      overkillPenalty:  turn >= 3 ? 3 : 1,
      scoreEffects:     2 + turn * 2,
      synergies:        3,
      tempo:            3 + turn * 2,
      passPenalty:      8 + turn * 4,
    };

    let score = 0;

    
    score += (state[player].missionPoints - state[opponent].missionPoints) * w.missionPoints;

    
    score += MissionEvaluator.evaluateMissionControl(state, player) * w.missionControl;

    
    score += BoardEvaluator.evaluateBoardPresence(state, player, turn) * w.boardPresence;

    
    score += ChakraEvaluator.evaluateChakraAdvantage(state, player) * w.chakraAdvantage;

    
    score += (state[player].hand.length - state[opponent].hand.length) * w.handSize;

    
    score += BoardEvaluator.evaluateEdgeValue(state, player);

    
    score += BoardEvaluator.evaluateHandQuality(state, player) * w.handQuality;

    
    score += BoardEvaluator.evaluateHiddenThreats(state, player) * w.hiddenThreats;

    
    score -= BoardEvaluator.evaluateOverkill(state, player) * w.overkillPenalty;

    
    score += BoardEvaluator.evaluateScoreEffects(state, player) * w.scoreEffects;

    
    score += BoardEvaluator.evaluateSynergies(state, player) * w.synergies;

    
    score += BoardEvaluator.evaluateTempo(state, player) * w.tempo;

    
    score += BoardEvaluator.evaluateSummonAwareness(state, player, turn);

    
    
    score -= BoardEvaluator.evaluatePassPenalty(state, player) * w.passPenalty;

    return score;
  }

  

  static evaluateBoardPresence(state: GameState, player: PlayerID, turn: number): number {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';
    let score = 0;

    let totalMyChars = 0;
    let totalOppChars = 0;

    for (const mission of state.activeMissions) {
      const myChars = getMyChars(mission, player);
      const oppChars = getOppChars(mission, player);

      totalMyChars += myChars.length;
      totalOppChars += oppChars.length;

      
      score += (myChars.length - oppChars.length) * 0.8;

      
      const myPower = myChars.reduce(
        (sum, c) => sum + calculateCharacterPower(state, c, player), 0,
      );
      const oppPower = oppChars.reduce(
        (sum, c) => sum + calculateCharacterPower(state, c, opponent), 0,
      );

      const missionValue = pointsGagnesEnRemportant(mission);
      score += (myPower - oppPower) * missionValue * 0.35;

      
      if (myChars.length > 0 && myPower > 0) {
        score += missionValue * 0.2;
      }
      
      if (oppChars.length > 0 && myChars.length === 0) {
        score -= missionValue * 0.3;
      }
    }

    
    
    if (turn < 4) {
      score += (totalMyChars - totalOppChars) * 1.0;
    }

    return score;
  }

  

  static evaluateEdgeValue(state: GameState, player: PlayerID): number {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';
    const hasEdge = state.edgeHolder === player;
    const turn = state.turn ?? 1;

    let tiedMissionValue = 0;
    let closeMissionValue = 0;

    for (const mission of state.activeMissions) {
      if (mission.wonBy) continue; // Already scored

      const myChars = getMyChars(mission, player);
      const oppChars = getOppChars(mission, player);
      const myPower = myChars.reduce(
        (sum, c) => sum + calculateCharacterPower(state, c, player), 0,
      );
      const oppPower = oppChars.reduce(
        (sum, c) => sum + calculateCharacterPower(state, c, opponent), 0,
      );
      const missionValue = pointsGagnesEnRemportant(mission);

      if (myPower === oppPower && myPower > 0) {
        tiedMissionValue += missionValue;
      } else if (Math.abs(myPower - oppPower) <= 2 && myPower > 0 && oppPower > 0) {
        closeMissionValue += missionValue;
      }
    }

    
    const turnMultiplier = turn === 4 ? 2.5 : turn === 3 ? 1.8 : 1.0;

    const edgeImpact = (tiedMissionValue * 3 + closeMissionValue * 0.5) * turnMultiplier;

    if (hasEdge) {
      
      return Math.max(5, edgeImpact);
    }
    
    return -edgeImpact * 0.6;
  }

  

  static evaluateHandQuality(state: GameState, player: PlayerID): number {
    let score = 0;
    const hand = state[player].hand;
    const chakra = state[player].chakra;
    const turn = state.turn ?? 1;

    
    if (hand.length > 0 && hand[0].cardId === '__hidden_hand__') {
      return hand.length * 0.5; // Small bonus per card in hand
    }

    for (const card of hand) {
      const tier = getCardTier(card);
      const cost = card.chakra ?? 0;

      
      if (cost <= chakra) {
        score += tier * 1.0; // Playable now
      } else if (cost <= chakra + 5 + turn) {
        score += tier * 0.4; // Might afford next turn
      } else {
        score += tier * 0.1; // Too expensive
      }

      
      if (card.effects?.some(e => e.type === 'SCORE') && turn >= 2) {
        score += tier * 0.3;
      }

      
      if (hasUpgradeTarget(state, player, card)) {
        score += tier * 0.5;
      }
    }

    return score;
  }

  

  static evaluateHiddenThreats(state: GameState, player: PlayerID): number {
    let myScore = 0;
    let oppScore = 0;

    for (const mission of state.activeMissions) {
      const myChars = getMyChars(mission, player);
      const oppChars = getOppChars(mission, player);

      
      for (const c of myChars) {
        if (!c.isHidden) continue;
        const card = topCard(c);
        const tier = getCardTier(card);

        
        let value = tier * 0.5;

        
        if (card.effects?.some(e => e.type === 'AMBUSH')) {
          value += tier * 0.8;
        }

        
        if (c.powerTokens > 0) {
          value += c.powerTokens * 0.5;
        }

        myScore += value;
      }

      
      for (const c of oppChars) {
        if (!c.isHidden) continue;
        oppScore += 3; // Unknown threat per hidden card
        if (c.powerTokens > 0) {
          oppScore += c.powerTokens * 0.5;
        }
      }
    }

    return myScore - oppScore;
  }

  

  static evaluateOverkill(state: GameState, player: PlayerID): number {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';
    let totalWaste = 0;

    for (const mission of state.activeMissions) {
      if (mission.wonBy) continue;

      const myChars = getMyChars(mission, player);
      const oppChars = getOppChars(mission, player);
      const myPower = myChars.reduce(
        (sum, c) => sum + calculateCharacterPower(state, c, player), 0,
      );
      const oppPower = oppChars.reduce(
        (sum, c) => sum + calculateCharacterPower(state, c, opponent), 0,
      );
      const missionValue = pointsGagnesEnRemportant(mission);

      if (myPower > oppPower && myPower > 0) {
        const excess = myPower - oppPower - 1;
        if (excess > 0) {
          
          const oppHidden = oppChars.filter(c => c.isHidden).length;
          if (oppHidden > 0) continue;

          
          const valueAdjust = Math.max(1, 8 - missionValue);
          totalWaste += excess * 0.3 * valueAdjust * 0.5;
        }
      }
    }

    return totalWaste;
  }

  

  static evaluateScoreEffects(state: GameState, player: PlayerID): number {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';
    let score = 0;

    for (const mission of state.activeMissions) {
      if (mission.wonBy) continue;

      const myChars = getMyChars(mission, player);
      const oppChars = getOppChars(mission, player);
      const myPower = myChars.reduce(
        (sum, c) => sum + calculateCharacterPower(state, c, player), 0,
      );
      const oppPower = oppChars.reduce(
        (sum, c) => sum + calculateCharacterPower(state, c, opponent), 0,
      );

      
      const winning = myPower > oppPower ||
        (myPower === oppPower && myPower > 0 && state.edgeHolder === player);
      if (!winning || myPower === 0) continue;

      
      for (const c of myChars) {
        if (c.isHidden) continue;
        const card = topCard(c);
        for (const effect of card.effects ?? []) {
          if (effect.type !== 'SCORE') continue;
          score += getCardTier(card) * 0.5;
        }
      }

      
      if (mission.card.effects?.some(e => e.type === 'SCORE')) {
        score += 2;
      }
    }

    return score;
  }

  

  static evaluateSynergies(state: GameState, player: PlayerID): number {
    let score = 0;

    
    const hand = state[player].hand;
    if (hand.length > 0 && hand[0].cardId !== '__hidden_hand__') {
      score += evaluateHandSynergies(hand);
    }

    
    score += evaluateBoardSynergies(state, player);

    
    if (hand.length > 0 && hand[0].cardId !== '__hidden_hand__') {
      const boardCardIds: string[] = [];
      for (const mission of state.activeMissions) {
        const chars = getMyChars(mission, player);
        for (const c of chars) {
          if (!c.isHidden) boardCardIds.push(topCard(c).cardId);
        }
      }
      const handCardIds = hand.map(c => c.cardId);
      const combinedSynergy = evaluateCardSynergies([...boardCardIds, ...handCardIds]);
      const boardOnlySynergy = evaluateCardSynergies(boardCardIds);
      const handOnlySynergy = evaluateCardSynergies(handCardIds);
      
      score += Math.max(0, combinedSynergy - boardOnlySynergy - handOnlySynergy);
    }

    
    for (const mission of state.activeMissions) {
      const myChars = getMyChars(mission, player);
      const hasAkamaru = myChars.some(c =>
        !c.isHidden && topCard(c).name_fr === 'Akamaru' &&
        (topCard(c).cardId === 'KS-027-C'),
      );
      if (hasAkamaru) {
        const hasKiba = myChars.some(c =>
          !c.isHidden && topCard(c).name_fr === 'Kiba Inuzuka',
        );
        if (!hasKiba) score -= 3; // Akamaru will return to hand
      }
    }

    return score;
  }

  

  static evaluateTempo(state: GameState, player: PlayerID): number {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';

    if (state.phase !== 'action') return 0;

    let score = 0;

    
    if (state[opponent].hasPassed && !state[player].hasPassed) {
      const playableCards = state[player].hand.filter(
        c => (c.chakra ?? 0) <= state[player].chakra || state[player].chakra >= 1,
      ).length;
      
      score += playableCards * 3 + state[player].chakra * 1.0;
    }

    
    if (state[player].hasPassed && !state[opponent].hasPassed) {
      const oppPlayable = state[opponent].hand.filter(
        c => (c.chakra ?? 0) <= state[opponent].chakra || state[opponent].chakra >= 1,
      ).length;
      score -= 3 + oppPlayable * 1.5;
    }

    return score;
  }

  

  
  static evaluatePassPenalty(state: GameState, player: PlayerID): number {
    if (state.phase !== 'action') return 0;
    if (!state[player].hasPassed) return 0;

    const hand = state[player].hand;
    const chakra = state[player].chakra;

    
    if (hand.length > 0 && hand[0].cardId === '__hidden_hand__') return 0;

    
    const playableFaceUp = hand.filter(c => (c.chakra ?? 0) <= chakra).length;
    const canPlayHidden = hand.length > 0 && chakra >= 1 ? 1 : 0;

    if (playableFaceUp === 0 && canPlayHidden === 0) return 0; // Passing was forced

    let penalty = 0;

    
    penalty += Math.min(chakra, 10) * 0.3;

    
    penalty += playableFaceUp * 0.8;

    
    const turn = state.turn ?? 1;
    if (turn >= 3) {
      penalty *= 1.5;
    }

    return penalty;
  }

  

  static evaluateSummonAwareness(state: GameState, player: PlayerID, turn: number): number {
    if (turn === 4) return 0; // Turn 4: summons count fully (last scoring)

    let discount = 0;
    for (const mission of state.activeMissions) {
      const myChars = getMyChars(mission, player);
      for (const c of myChars) {
        if (c.isHidden) continue;
        const card = topCard(c);
        if (isSummon(card)) {
          
          const power = calculateCharacterPower(state, c, player);
          discount += power * 0.3; // ~30% discount on summon power value
        }
      }
    }

    return -discount;
  }

  

  static evaluateTerminal(state: GameState, player: PlayerID): number {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';
    const myPoints = state[player].missionPoints;
    const oppPoints = state[opponent].missionPoints;

    if (state.phase === 'gameOver') {
      if (myPoints > oppPoints) return 10000;
      if (oppPoints > myPoints) return -10000;
      return state.edgeHolder === player ? 10000 : -10000;
    }

    return BoardEvaluator.evaluate(state, player);
  }
}
