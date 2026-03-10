/**
 * BoardEvaluator - Central heuristic for AI decision-making.
 *
 * Returns a score from the perspective of the given player.
 * Positive = favorable, negative = unfavorable.
 *
 * Turn-aware: weights shift as the game progresses.
 * Card-aware: uses CardTiers for card quality, synergies, and strategic context.
 */

import type { GameState, PlayerID, CharacterInPlay, ActiveMission } from '../../engine/types';
import { calculateCharacterPower } from '../../engine/phases/PowerCalculation';
import { MissionEvaluator } from './MissionEvaluator';
import { ChakraEvaluator } from './ChakraEvaluator';
import { getCardTier, evaluateHandSynergies, evaluateBoardSynergies, hasUpgradeTarget, isSummon, evaluateCardSynergies } from './CardTiers';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getMyChars(mission: ActiveMission, player: PlayerID): CharacterInPlay[] {
  return player === 'player1' ? mission.player1Characters : mission.player2Characters;
}

function getOppChars(mission: ActiveMission, player: PlayerID): CharacterInPlay[] {
  return player === 'player1' ? mission.player2Characters : mission.player1Characters;
}

function topCard(c: CharacterInPlay) {
  return c.stack.length > 0 ? c.stack[c.stack.length - 1] : c.card;
}

// ─── Main Evaluator ─────────────────────────────────────────────────────────

export class BoardEvaluator {
  /**
   * Evaluate the entire board state from a player's perspective.
   * Combines 11+ weighted components with turn-dependent weights.
   */
  static evaluate(state: GameState, player: PlayerID): number {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';
    const turn = state.turn ?? 1;

    // Turn-dependent weight profiles
    const w = {
      missionPoints:    100,
      missionControl:   25 + turn * 10,            // 35/45/55/65
      boardPresence:    15 - turn * 2,             // 13/11/9/7
      chakraAdvantage:  turn <= 2 ? 8 : 3,
      handSize:         turn <= 2 ? 4 : 1,
      handQuality:      turn <= 2 ? 3 : 1,
      hiddenThreats:    5,
      overkillPenalty:  turn >= 3 ? 3 : 1,
      scoreEffects:     2 + turn * 2,              // 4/6/8/10
      synergies:        3,
      tempo:            1 + turn,                  // 2/3/4/5
    };

    let score = 0;

    // 1. Mission points scored (always most important)
    score += (state[player].missionPoints - state[opponent].missionPoints) * w.missionPoints;

    // 2. Mission control (projected wins - confidence-based)
    score += MissionEvaluator.evaluateMissionControl(state, player) * w.missionControl;

    // 3. Board presence (characters + power, weighted by mission value)
    score += BoardEvaluator.evaluateBoardPresence(state, player, turn) * w.boardPresence;

    // 4. Chakra advantage
    score += ChakraEvaluator.evaluateChakraAdvantage(state, player) * w.chakraAdvantage;

    // 5. Hand size advantage
    score += (state[player].hand.length - state[opponent].hand.length) * w.handSize;

    // 6. Edge token (dynamic value based on tied/close missions)
    score += BoardEvaluator.evaluateEdgeValue(state, player);

    // 7. Hand quality (card-tier aware)
    score += BoardEvaluator.evaluateHandQuality(state, player) * w.handQuality;

    // 8. Hidden character threats (card-aware)
    score += BoardEvaluator.evaluateHiddenThreats(state, player) * w.hiddenThreats;

    // 9. Overkill penalty (wasted power)
    score -= BoardEvaluator.evaluateOverkill(state, player) * w.overkillPenalty;

    // 10. SCORE effect anticipation
    score += BoardEvaluator.evaluateScoreEffects(state, player) * w.scoreEffects;

    // 11. Synergies (hand + board)
    score += BoardEvaluator.evaluateSynergies(state, player) * w.synergies;

    // 12. Tempo (action advantage when opponent has passed)
    score += BoardEvaluator.evaluateTempo(state, player) * w.tempo;

    // 13. Summon awareness (temporary board presence, discount on turns 1-3)
    score += BoardEvaluator.evaluateSummonAwareness(state, player, turn);

    return score;
  }

  // ─── Component: Board Presence ──────────────────────────────────────────

  static evaluateBoardPresence(state: GameState, player: PlayerID, turn: number): number {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';
    let score = 0;

    for (const mission of state.activeMissions) {
      const myChars = getMyChars(mission, player);
      const oppChars = getOppChars(mission, player);

      // Character count advantage
      score += (myChars.length - oppChars.length) * 0.5;

      // Power advantage weighted by mission value
      const myPower = myChars.reduce(
        (sum, c) => sum + calculateCharacterPower(state, c, player), 0,
      );
      const oppPower = oppChars.reduce(
        (sum, c) => sum + calculateCharacterPower(state, c, opponent), 0,
      );

      const missionValue = mission.basePoints + mission.rankBonus;
      score += (myPower - oppPower) * missionValue * 0.3;
    }

    return score;
  }

  // ─── Component: Dynamic Edge Token Value ────────────────────────────────

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
      const missionValue = mission.basePoints + mission.rankBonus;

      if (myPower === oppPower && myPower > 0) {
        tiedMissionValue += missionValue;
      } else if (Math.abs(myPower - oppPower) <= 2 && myPower > 0 && oppPower > 0) {
        closeMissionValue += missionValue;
      }
    }

    // Turn multiplier: edge matters much more on turn 4 (final scoring)
    const turnMultiplier = turn === 4 ? 2.5 : turn === 3 ? 1.8 : 1.0;

    const edgeImpact = (tiedMissionValue * 3 + closeMissionValue * 0.5) * turnMultiplier;

    if (hasEdge) {
      // Minimum value of 5 - edge is always somewhat valuable
      return Math.max(5, edgeImpact);
    }
    // Not having edge when missions are tied is bad
    return -edgeImpact * 0.6;
  }

  // ─── Component: Hand Quality (Card-Tier Aware) ──────────────────────────

  static evaluateHandQuality(state: GameState, player: PlayerID): number {
    let score = 0;
    const hand = state[player].hand;
    const chakra = state[player].chakra;
    const turn = state.turn ?? 1;

    // Skip placeholder hands (AI sanitized state)
    if (hand.length > 0 && hand[0].cardId === '__hidden_hand__') {
      return hand.length * 0.5; // Small bonus per card in hand
    }

    for (const card of hand) {
      const tier = getCardTier(card);
      const cost = card.chakra ?? 0;

      // Card value scaled by affordability
      if (cost <= chakra) {
        score += tier * 1.0; // Playable now
      } else if (cost <= chakra + 5 + turn) {
        score += tier * 0.4; // Might afford next turn
      } else {
        score += tier * 0.1; // Too expensive
      }

      // SCORE cards are more valuable later
      if (card.effects?.some(e => e.type === 'SCORE') && turn >= 2) {
        score += tier * 0.3;
      }

      // Upgrade potential: having a target in play is very efficient
      if (hasUpgradeTarget(state, player, card)) {
        score += tier * 0.5;
      }
    }

    return score;
  }

  // ─── Component: Hidden Threats (Card-Aware) ─────────────────────────────

  static evaluateHiddenThreats(state: GameState, player: PlayerID): number {
    let myScore = 0;
    let oppScore = 0;

    for (const mission of state.activeMissions) {
      const myChars = getMyChars(mission, player);
      const oppChars = getOppChars(mission, player);

      // OUR hidden characters: AI knows what they are
      for (const c of myChars) {
        if (!c.isHidden) continue;
        const card = topCard(c);
        const tier = getCardTier(card);

        // Base value from card tier
        let value = tier * 0.5;

        // AMBUSH synergy - we hid this card on purpose for the AMBUSH
        if (card.effects?.some(e => e.type === 'AMBUSH')) {
          value += tier * 0.8;
        }

        // Power tokens on hidden chars still count for scoring
        if (c.powerTokens > 0) {
          value += c.powerTokens * 0.5;
        }

        myScore += value;
      }

      // OPPONENT hidden characters: unknown identity, moderate threat
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

  // ─── Component: Overkill Penalty ────────────────────────────────────────

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
      const missionValue = mission.basePoints + mission.rankBonus;

      if (myPower > oppPower && myPower > 0) {
        const excess = myPower - oppPower - 1;
        if (excess > 0) {
          // Don't penalize if opponent has hidden chars (uncertainty)
          const oppHidden = oppChars.filter(c => c.isHidden).length;
          if (oppHidden > 0) continue;

          // More overkill on low-value missions is worse
          const valueAdjust = Math.max(1, 8 - missionValue);
          totalWaste += excess * 0.3 * valueAdjust * 0.5;
        }
      }
    }

    return totalWaste;
  }

  // ─── Component: SCORE Effect Anticipation ───────────────────────────────

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

      // Only count SCORE effects if we're winning or tied with edge
      const winning = myPower > oppPower ||
        (myPower === oppPower && myPower > 0 && state.edgeHolder === player);
      if (!winning || myPower === 0) continue;

      // Our characters' SCORE effects
      for (const c of myChars) {
        if (c.isHidden) continue;
        const card = topCard(c);
        for (const effect of card.effects ?? []) {
          if (effect.type !== 'SCORE') continue;
          score += getCardTier(card) * 0.5;
        }
      }

      // Mission card's SCORE effects
      if (mission.card.effects?.some(e => e.type === 'SCORE')) {
        score += 2;
      }
    }

    return score;
  }

  // ─── Component: Synergies ───────────────────────────────────────────────

  static evaluateSynergies(state: GameState, player: PlayerID): number {
    let score = 0;

    // Hand synergies
    const hand = state[player].hand;
    if (hand.length > 0 && hand[0].cardId !== '__hidden_hand__') {
      score += evaluateHandSynergies(hand);
    }

    // Board synergies (visible characters)
    score += evaluateBoardSynergies(state, player);

    // Cross-hand-board synergies: cards in hand that synergize with board
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
      // Cross synergy = total - individual (avoid double-counting)
      score += Math.max(0, combinedSynergy - boardOnlySynergy - handOnlySynergy);
    }

    // Penalty: Akamaru without Kiba on the same mission
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

  // ─── Component: Tempo ───────────────────────────────────────────────────

  static evaluateTempo(state: GameState, player: PlayerID): number {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';

    if (state.phase !== 'action') return 0;

    let score = 0;

    // Opponent has passed, we haven't - free actions!
    if (state[opponent].hasPassed && !state[player].hasPassed) {
      const playableCards = state[player].hand.filter(
        c => (c.chakra ?? 0) <= state[player].chakra || state[player].chakra >= 1,
      ).length;
      score += playableCards * 2 + state[player].chakra * 0.5;
    }

    // We've passed, opponent hasn't - they get free actions
    if (state[player].hasPassed && !state[opponent].hasPassed) {
      score -= 3;
    }

    return score;
  }

  // ─── Component: Summon Awareness ────────────────────────────────────────

  static evaluateSummonAwareness(state: GameState, player: PlayerID, turn: number): number {
    if (turn === 4) return 0; // Turn 4: summons count fully (last scoring)

    let discount = 0;
    for (const mission of state.activeMissions) {
      const myChars = getMyChars(mission, player);
      for (const c of myChars) {
        if (c.isHidden) continue;
        const card = topCard(c);
        if (isSummon(card)) {
          // Summons return to hand at end of turn - discount their board presence
          const power = calculateCharacterPower(state, c, player);
          discount += power * 0.3; // ~30% discount on summon power value
        }
      }
    }

    return -discount;
  }

  // ─── Terminal Evaluation ────────────────────────────────────────────────

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
