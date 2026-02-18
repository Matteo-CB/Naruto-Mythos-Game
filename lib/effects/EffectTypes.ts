import type { GameState, PlayerID, CharacterInPlay, EffectType } from '../engine/types';

/**
 * Context provided to each effect handler.
 */
export interface EffectContext {
  state: GameState;
  sourcePlayer: PlayerID;
  sourceCard: CharacterInPlay;
  sourceMissionIndex: number;
  triggerType: EffectType;
  isUpgrade: boolean; // Whether this is being triggered by an upgrade
  // For sub-play effects (e.g., Jiraiya playing a Summon)
  subPlayCostReduction?: number;
}

/**
 * Result returned by an effect handler.
 */
export interface EffectResult {
  state: GameState;
  requiresTargetSelection?: boolean;
  targetSelectionType?: string;
  validTargets?: string[];
  description?: string;
}

/**
 * Handler function type for individual card effects.
 */
export type EffectHandler = (ctx: EffectContext) => EffectResult;

/**
 * A registered handler for a specific card and effect type.
 */
export interface RegisteredHandler {
  cardId: string;
  effectType: EffectType;
  handler: EffectHandler;
  description: string;
}
