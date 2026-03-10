/**
 * Coach: AI coaching engine.
 *
 * Uses ISMCTS with neural network evaluation to:
 *  1. Estimate the current win probability
 *  2. Rank all valid actions by quality
 *  3. Rate cards in the player's hand
 *  4. Generate strategic warnings and tips
 *
 * The coach always sees the full sanitized state (same info as the player).
 */

import type { GameState, GameAction, PlayerID, ActiveMission } from '../../engine/types';
import { GameEngine } from '../../engine/GameEngine';
import { AIPlayer } from '../AIPlayer';
import { NeuralISMCTS, DEFAULT_KAGE_CONFIG } from '../neural/NeuralISMCTS';
import { FeatureExtractor } from '../neural/FeatureExtractor';
import { NeuralEvaluator } from '../neural/NeuralEvaluator';
import { BoardEvaluator } from '../evaluation/BoardEvaluator';
import { calculateCharacterPower } from '../../engine/phases/PowerCalculation';
import type {
  CoachAdvice,
  MissionCoachAnalysis,
  HandCardRating,
  ActionExplanation,
} from './CoachTypes';

const COACH_SIMULATIONS = 300; // fast enough for real-time advice

export class Coach {
  private mcts: NeuralISMCTS;
  private evaluator: NeuralEvaluator;

  constructor() {
    this.evaluator = NeuralEvaluator.getInstance();
    this.mcts = new NeuralISMCTS({
      ...DEFAULT_KAGE_CONFIG,
      simulations: COACH_SIMULATIONS,
      evaluator: this.evaluator,
      useBatchedEval: false, // sync for coaching
    });
  }

  /**
   * Produce coaching advice for the given player.
   * State should already be sanitized to the player's perspective.
   */
  async analyse(state: GameState, player: PlayerID): Promise<CoachAdvice> {
    const sanitized = AIPlayer.sanitizeStateForAI(state, player);
    const validActions = GameEngine.getValidActions(sanitized, player);

    // 1. Get ISMCTS action stats (visits + win rates per action)
    const actionStats = this.mcts.getActionStats(sanitized, player, validActions, COACH_SIMULATIONS);

    // 2. Compute overall win probability from root state evaluation
    let winProbability = 0.5;
    const nnReady = this.evaluator.isReady();
    if (nnReady) {
      const features = FeatureExtractor.extract(sanitized, player);
      winProbability = await this.evaluator.evaluateSingle(features);
      if (player === 'player2') winProbability = 1 - winProbability;
    } else {
      const heuristic = BoardEvaluator.evaluate(sanitized, player);
      winProbability = 1 / (1 + Math.exp(-heuristic / 60));
    }

    // 3. Per-mission analysis
    const missionAnalysis = this.analyseMissions(sanitized, player);

    // 4. Rank actions with explanations
    const totalVisits = actionStats.reduce((s, a) => s + a.visits, 0);
    const actionRankings: ActionExplanation[] = actionStats
      .sort((a, b) => b.winRate - a.winRate)
      .map(stat => ({
        action: stat.action,
        winRateGain: stat.winRate - winProbability,
        explanation: this.explainAction(stat.action, sanitized, player, stat.winRate),
        advantage: stat.visits > 0
          ? `${stat.visits}/${totalVisits} simulations, win rate ${(stat.winRate * 100).toFixed(0)}%`
          : 'not explored',
      }));

    const bestAction = actionRankings.length > 0 ? actionRankings[0] : null;

    // 5. Hand card ratings
    const handRatings = this.rateHandCards(sanitized, player);

    // 6. Warnings and tips
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';
    const warnings = this.generateWarnings(sanitized, player, opponent);
    const tips = this.generateTips(sanitized, player, missionAnalysis);

    // 7. Board assessment
    const boardAssessment = this.assessBoard(winProbability);

    return {
      winProbability,
      boardAssessment,
      missionAnalysis,
      bestAction,
      actionRankings,
      handRatings,
      warnings,
      tips,
      simulationsUsed: COACH_SIMULATIONS,
      neuralNetUsed: nnReady,
    };
  }

  // ─── Mission Analysis ───────────────────────────────────────────────────────

  private analyseMissions(state: GameState, player: PlayerID): MissionCoachAnalysis[] {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';

    return state.activeMissions.map((mission, idx) => {
      const myChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
      const oppChars = player === 'player1' ? mission.player2Characters : mission.player1Characters;

      const myPower = myChars.reduce((s, c) => {
        try { return s + calculateCharacterPower(state, c, player); } catch { return s; }
      }, 0);
      const oppPower = oppChars.reduce((s, c) => {
        try { return s + calculateCharacterPower(state, c, opponent); } catch { return s; }
      }, 0);

      const pointValue = mission.basePoints + mission.rankBonus;

      let myWinProbability: number;
      let status: MissionCoachAnalysis['status'];
      let recommendation: MissionCoachAnalysis['recommendation'];

      if (myChars.length === 0 && oppChars.length === 0) {
        status = 'empty';
        myWinProbability = 0.5;
        recommendation = 'attack';
      } else if (myPower === 0 && oppPower === 0) {
        status = 'tied';
        myWinProbability = state.edgeHolder === player ? 0.6 : 0.4;
        recommendation = 'attack';
      } else if (myPower > oppPower * 1.5) {
        status = 'dominating';
        myWinProbability = 0.9;
        recommendation = 'monitor';
      } else if (myPower > oppPower) {
        status = 'winning';
        myWinProbability = 0.7;
        recommendation = 'secure';
      } else if (myPower === oppPower) {
        status = 'tied';
        myWinProbability = state.edgeHolder === player ? 0.55 : 0.45;
        recommendation = 'attack';
      } else if (oppPower > myPower * 1.5 && oppChars.length > 2) {
        status = 'losing';
        myWinProbability = 0.15;
        recommendation = pointValue >= 5 ? 'defend' : 'abandon';
      } else {
        status = 'losing';
        myWinProbability = 0.3;
        recommendation = 'defend';
      }

      const note = this.missionNote(status, recommendation, myPower, oppPower, pointValue, mission);

      return {
        missionIndex: idx,
        rank: mission.rank,
        myWinProbability,
        myPower,
        opponentPower: oppPower,
        pointValue,
        status,
        recommendation,
        note,
      };
    });
  }

  private missionNote(
    status: MissionCoachAnalysis['status'],
    recommendation: MissionCoachAnalysis['recommendation'],
    myPower: number,
    oppPower: number,
    pointValue: number,
    mission: ActiveMission,
  ): string {
    const pts = `${pointValue} pts`;
    switch (recommendation) {
      case 'abandon':
        return `Adversaire trop fort ici (${oppPower} vs ${myPower}). Mission ${pts} - pas rentable a défendre.`;
      case 'defend':
        return `Adversaire devant (${oppPower} vs ${myPower}). Ajouter +${oppPower - myPower + 1} puissance pour reprendre.`;
      case 'secure':
        return `Tu menes (${myPower} vs ${oppPower}). Consolide pour sécuriser ${pts}.`;
      case 'attack':
        return `Mission ${pts} a portée. Joue un personnage puissant ici.`;
      case 'monitor':
        return `Dominant (${myPower} vs ${oppPower}). Mission ${pts} quasi assurée.`;
    }
  }

  // ─── Action Explanation ─────────────────────────────────────────────────────

  private explainAction(
    action: GameAction,
    state: GameState,
    player: PlayerID,
    winRate: number,
  ): string {
    const winPct = `(${(winRate * 100).toFixed(0)}% de victoire)`;

    switch (action.type) {
      case 'PLAY_CHARACTER': {
        const card = state[player].hand[action.cardIndex];
        const mission = state.activeMissions[action.missionIndex];
        if (!card || !mission) return `Jouer une carte sur Mission ${mission?.rank ?? '?'} ${winPct}`;
        const effects = card.effects?.map(e => e.type).join(', ') ?? '';
        return `Jouer ${card.name_fr} (${card.power} force) sur Mission ${mission.rank} ${winPct}${effects ? ` - effets: ${effects}` : ''}`;
      }
      case 'PLAY_HIDDEN': {
        const card = state[player].hand[action.cardIndex];
        const mission = state.activeMissions[action.missionIndex];
        const name = card ? card.name_fr : 'carte';
        const hasAmbush = card?.effects?.some(e => e.type === 'AMBUSH');
        return `Cacher ${name} sur Mission ${mission?.rank ?? '?'} ${winPct}${hasAmbush ? ' - effet AMBUSH disponible a la révélation' : ''}`;
      }
      case 'REVEAL_CHARACTER': {
        const mission = state.activeMissions[action.missionIndex];
        const chars = player === 'player1' ? mission?.player1Characters : mission?.player2Characters;
        const char = chars?.find(c => c.instanceId === action.characterInstanceId);
        const name = char ? char.card.name_fr : 'personnage caché';
        return `Révéler ${name} sur Mission ${mission?.rank ?? '?'} ${winPct} - active AMBUSH`;
      }
      case 'UPGRADE_CHARACTER': {
        const card = state[player].hand[action.cardIndex];
        const mission = state.activeMissions[action.missionIndex];
        return `Améliorer vers ${card?.name_fr ?? '?'} (${card?.power ?? 0} force) sur Mission ${mission?.rank ?? '?'} ${winPct}`;
      }
      case 'PASS':
        return `Passer ${winPct} - recuperer le jeton Avantage pour le prochain tour`;
      default:
        return `Action ${action.type} ${winPct}`;
    }
  }

  // ─── Hand Card Ratings ──────────────────────────────────────────────────────

  private rateHandCards(state: GameState, player: PlayerID): HandCardRating[] {
    const opponent: PlayerID = player === 'player1' ? 'player2' : 'player1';
    const myState = state[player];
    const ratings: HandCardRating[] = [];

    for (let i = 0; i < myState.hand.length; i++) {
      const card = myState.hand[i];
      if (!card) continue;

      let rating = 5; // base
      let reason = '';
      let bestMissionIndex: number | null = null;
      let bestMissionScore = -Infinity;

      // Can we afford it?
      const canAfford = (card.chakra ?? 0) <= myState.chakra;
      if (!canAfford) {
        rating = 2;
        reason = `Trop cher (${card.chakra} chakra requis, ${myState.chakra} disponible)`;
      } else {
        // Find best mission for this card
        for (let m = 0; m < state.activeMissions.length; m++) {
          const mission = state.activeMissions[m];
          const myChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
          const oppChars = player === 'player1' ? mission.player2Characters : mission.player1Characters;

          // Check name uniqueness
          const nameConflict = myChars.some(c => c.card.name_fr === card.name_fr && !c.isHidden);
          if (nameConflict) continue;

          const myPower = myChars.reduce((s, c) => {
            try { return s + calculateCharacterPower(state, c, player); } catch { return s; }
          }, 0);
          const oppPower = oppChars.reduce((s, c) => {
            try { return s + calculateCharacterPower(state, c, opponent); } catch { return s; }
          }, 0);

          const missionValue = mission.basePoints + mission.rankBonus;
    
          const newMyPower = myPower + (card.power ?? 0);
          const advantage = newMyPower - oppPower;

          // Score: mission value × power advantage
          const missionScore = missionValue * (advantage > 0 ? 2 : 0.5) + missionValue;

          if (missionScore > bestMissionScore) {
            bestMissionScore = missionScore;
            bestMissionIndex = m;
          }
        }

        // Rate the card
        const power = card.power ?? 0;
        const hasAmbush = card.effects?.some(e => e.type === 'AMBUSH');
        const hasScore = card.effects?.some(e => e.type === 'SCORE');
        const hasPowerup = card.effects?.some(e => /POWERUP/i.test(e.description));
        const hasChakraBonus = card.effects?.some(e => /CHAKRA\s*\+/i.test(e.description));

        // Power-based rating
        if (power >= 6) rating = 8;
        else if (power >= 4) rating = 6.5;
        else if (power >= 2) rating = 5;
        else rating = 3;

        // Effect bonuses
        if (hasScore) { rating += 1; }
        if (hasPowerup) { rating += 0.5; }
        if (hasChakraBonus && state.turn <= 2) { rating += 1; }

        // AMBUSH cards: better hidden
        if (hasAmbush) {
          rating += 0.5;
          reason = `Carte AMBUSH - envisage de la cacher d'abord`;
        } else {
          reason = `${power} force`;
          if (hasScore) reason += ', effet SCORE';
          if (hasPowerup) reason += ', POWERUP';
          if (hasChakraBonus) reason += ', bonus CHAKRA';
        }

        if (!canAfford) {
          rating = Math.min(rating, 3);
          reason = 'Pas assez de chakra';
        }
      }

      ratings.push({
        cardIndex: i,
        cardName: card.name_fr,
        rating: Math.min(10, Math.max(0, Math.round(rating * 10) / 10)),
        bestMissionIndex,
        reason,
      });
    }

    return ratings;
  }

  // ─── Warnings & Tips ────────────────────────────────────────────────────────

  private generateWarnings(state: GameState, player: PlayerID, opponent: PlayerID): string[] {
    const warnings: string[] = [];
    const oppState = state[opponent];
    const myState = state[player];

    // Hidden characters that could be revealed
    const oppHiddenCount = state.activeMissions.reduce((s, m) => {
      const chars = player === 'player1' ? m.player2Characters : m.player1Characters;
      return s + chars.filter(c => c.isHidden).length;
    }, 0);

    if (oppHiddenCount > 0) {
      warnings.push(
        `L'adversaire a ${oppHiddenCount} personnage(s) caché(s) - ils peuvent avoir des effets AMBUSH puissants.`
      );
    }

    // Opponent has enough chakra to play high-cost cards
    if (oppState.chakra >= 6 && oppState.hand.length > 0) {
      warnings.push(
        `L'adversaire a ${oppState.chakra} chakra - il peut jouer des cartes puissantes.`
      );
    }

    // We're behind on points with few turns left
    if (myState.missionPoints < oppState.missionPoints && state.turn >= 3) {
      const deficit = oppState.missionPoints - myState.missionPoints;
      warnings.push(
        `Tu es en retard de ${deficit} points au tour ${state.turn}/4 - il faut agir vite.`
      );
    }

    // Running low on deck
    if (myState.deck.length <= 3) {
      warnings.push(`Ton deck est presque vide (${myState.deck.length} cartes restantes).`);
    }

    // Low chakra for late game
    if (state.turn === 4 && myState.chakra < 3 && myState.hand.length > 0) {
      warnings.push('Peu de chakra au dernier tour - gere bien tes ressources.');
    }

    return warnings;
  }

  private generateTips(
    state: GameState,
    player: PlayerID,
    missionAnalysis: MissionCoachAnalysis[],
  ): string[] {
    const tips: string[] = [];
    const myState = state[player];

    // High-value missions to focus on
    const highValueMission = missionAnalysis
      .filter(m => m.status === 'empty' || m.status === 'tied')
      .sort((a, b) => b.pointValue - a.pointValue)[0];

    if (highValueMission) {
      tips.push(
        `Mission ${highValueMission.rank} (${highValueMission.pointValue} pts) est contestée - priorité haute.`
      );
    }

    // AMBUSH cards in hand
    const ambushCard = myState.hand.find(c => c.effects?.some(e => e.type === 'AMBUSH'));
    if (ambushCard && state.turn <= 3) {
      tips.push(
        `Tu as ${ambushCard.name_fr} avec effet AMBUSH - envisage de la jouer cachée maintenant pour révéler plus tard.`
      );
    }

    // Edge token tip
    if (state.edgeHolder !== player && !myState.hasPassed) {
      tips.push('Passe en premier si tu es en avance - tu récupèreras le jeton Avantage.');
    }

    // Upgrade available
    for (const mission of state.activeMissions) {
      const myChars = player === 'player1' ? mission.player1Characters : mission.player2Characters;
      for (const char of myChars) {
        const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
        const upgrade = myState.hand.find(
          c => c.name_fr === topCard.name_fr && (c.chakra ?? 0) > (topCard.chakra ?? 0)
        );
        if (upgrade) {
          const diff = (upgrade.chakra ?? 0) - (topCard.chakra ?? 0);
          tips.push(
            `Tu peux améliorer ${topCard.name_fr} vers ${upgrade.name_fr} sur Mission ${mission.rank} pour seulement ${diff} chakra.`
          );
        }
      }
    }

    return tips.slice(0, 4); // max 4 tips to avoid info overload
  }

  // ─── Board Assessment ───────────────────────────────────────────────────────

  private assessBoard(winProbability: number): CoachAdvice['boardAssessment'] {
    if (winProbability >= 0.72) return 'winning';
    if (winProbability >= 0.55) return 'slightly_ahead';
    if (winProbability >= 0.45) return 'even';
    if (winProbability >= 0.28) return 'slightly_behind';
    return 'losing';
  }
}

/** Singleton coach instance */
let coachInstance: Coach | null = null;

export function getCoach(): Coach {
  if (!coachInstance) {
    coachInstance = new Coach();
  }
  return coachInstance;
}
