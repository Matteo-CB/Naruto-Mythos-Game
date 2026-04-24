

import type { GameAction, MissionRank } from '../../engine/types';

export interface MissionCoachAnalysis {
  missionIndex: number;
  rank: MissionRank;
  
  myWinProbability: number;
  
  myPower: number;
  
  opponentPower: number;
  
  pointValue: number;
  
  status: 'dominating' | 'winning' | 'tied' | 'losing' | 'empty';
  
  recommendation: 'secure' | 'attack' | 'defend' | 'abandon' | 'monitor';
  
  note: string;
}

export interface HandCardRating {
  cardIndex: number;
  cardName: string;
  
  rating: number;
  
  bestMissionIndex: number | null;
  
  reason: string;
}

export interface ActionExplanation {
  action: GameAction;
  
  winRateGain: number;
  
  explanation: string;
  
  advantage: string;
}

export interface CoachAdvice {
  
  winProbability: number;

  
  boardAssessment: 'winning' | 'slightly_ahead' | 'even' | 'slightly_behind' | 'losing';

  
  missionAnalysis: MissionCoachAnalysis[];

  
  bestAction: ActionExplanation | null;

  
  actionRankings: ActionExplanation[];

  
  handRatings: HandCardRating[];

  
  warnings: string[];

  
  tips: string[];

  
  simulationsUsed: number;

  
  neuralNetUsed: boolean;
}
