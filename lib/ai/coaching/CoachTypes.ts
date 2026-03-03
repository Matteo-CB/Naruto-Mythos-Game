/**
 * Type definitions for the AI Coaching System.
 *
 * The coach analyses the current game state and provides:
 *  - Win probability estimate
 *  - Per-mission analysis and power breakdown
 *  - Best recommended action with explanation
 *  - Card ratings for the player's hand
 *  - Strategic warnings and tips
 */

import type { GameAction, MissionRank } from '../../engine/types';

export interface MissionCoachAnalysis {
  missionIndex: number;
  rank: MissionRank;
  /** Estimated probability (0-1) that this player wins this mission */
  myWinProbability: number;
  /** My total effective power on this mission */
  myPower: number;
  /** Opponent's total effective power on this mission */
  opponentPower: number;
  /** Point value at stake: basePoints + rankBonus */
  pointValue: number;
  /** High-level assessment */
  status: 'dominating' | 'winning' | 'tied' | 'losing' | 'empty';
  /** Recommended strategy for this mission */
  recommendation: 'secure' | 'attack' | 'defend' | 'abandon' | 'monitor';
  /** Human-readable note about this mission */
  note: string;
}

export interface HandCardRating {
  cardIndex: number;
  cardName: string;
  /** Rating 0-10 for how good it would be to play this card now */
  rating: number;
  /** Best mission to play it on */
  bestMissionIndex: number | null;
  /** Why this rating */
  reason: string;
}

export interface ActionExplanation {
  action: GameAction;
  /** Estimated win rate improvement from this action */
  winRateGain: number;
  /** Short human-readable explanation */
  explanation: string;
  /** Why this beats the alternatives */
  advantage: string;
}

export interface CoachAdvice {
  /** Overall win probability for the requesting player (0-1) */
  winProbability: number;

  /** Board assessment summary */
  boardAssessment: 'winning' | 'slightly_ahead' | 'even' | 'slightly_behind' | 'losing';

  /** Per-mission analysis */
  missionAnalysis: MissionCoachAnalysis[];

  /** Best action recommended by the AI, with explanation */
  bestAction: ActionExplanation | null;

  /** All valid actions ranked by win rate, with explanations */
  actionRankings: ActionExplanation[];

  /** Card ratings for the player's hand */
  handRatings: HandCardRating[];

  /** Strategic warnings (things the player should watch out for) */
  warnings: string[];

  /** Positive tips (actions or strategies to consider) */
  tips: string[];

  /** Number of ISMCTS simulations used to compute this advice */
  simulationsUsed: number;

  /** Whether the neural network model was used */
  neuralNetUsed: boolean;
}
