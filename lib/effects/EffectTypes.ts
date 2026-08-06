import type { GameState, PlayerID, CharacterInPlay, EffectType } from '../engine/types';


export interface EffectContext {
  state: GameState;
  sourcePlayer: PlayerID;
  sourceCard: CharacterInPlay;
  sourceMissionIndex: number;
  triggerType: EffectType;
  isUpgrade: boolean; // Whether this is being triggered by an upgrade
  wasRevealed?: boolean; // Whether the card was just revealed from hidden
  
  subPlayCostReduction?: number;

  tokensBeforePlay?: number;
}


export interface EffectResult {
  state: GameState;
  requiresTargetSelection?: boolean;
  targetSelectionType?: string;
  validTargets?: string[];
  description?: string;
  
  descriptionKey?: string;
  
  descriptionParams?: Record<string, string | number>;
  
  selectingPlayer?: PlayerID;
  
  isOptional?: boolean;
  
  isMandatory?: boolean;
  
  minSelections?: number;
  
  maxSelections?: number;
}


export type EffectHandler = (ctx: EffectContext) => EffectResult;


export interface RegisteredHandler {
  cardId: string;
  effectType: EffectType;
  handler: EffectHandler;
  description: string;
}
