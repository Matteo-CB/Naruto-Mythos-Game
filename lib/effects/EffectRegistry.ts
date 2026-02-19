import type { EffectType } from '../engine/types';
import type { EffectHandler } from './EffectTypes';

/**
 * Registry mapping card IDs to their effect handlers.
 * Each card can have multiple handlers for different effect types.
 */
const registry: Map<string, Map<EffectType, EffectHandler>> = new Map();

/**
 * Register an effect handler for a specific card and effect type.
 */
export function registerEffect(cardId: string, effectType: EffectType, handler: EffectHandler): void {
  if (!registry.has(cardId)) {
    registry.set(cardId, new Map());
  }
  registry.get(cardId)!.set(effectType, handler);
}

/**
 * Get the effect handler for a specific card and effect type.
 */
export function getEffectHandler(cardId: string, effectType: EffectType): EffectHandler | undefined {
  // Try exact ID match first
  const cardHandlers = registry.get(cardId);
  if (cardHandlers) {
    const handler = cardHandlers.get(effectType);
    if (handler) return handler;
  }

  // Try normalized ID (strip " A" suffix for RA variants which use same effects)
  const normalizedId = cardId.replace(/\s*A$/, '').trim();
  if (normalizedId !== cardId) {
    const normalizedHandlers = registry.get(normalizedId);
    if (normalizedHandlers) {
      return normalizedHandlers.get(effectType);
    }
  }

  return undefined;
}

/**
 * Check if a card has a registered handler.
 */
export function hasHandler(cardId: string, effectType: EffectType): boolean {
  return getEffectHandler(cardId, effectType) !== undefined;
}

/**
 * Get all registered card IDs.
 */
export function getRegisteredCardIds(): string[] {
  return Array.from(registry.keys());
}

// =============================================================
// Import and register all handlers
// =============================================================
import { registerAllCommonHandlers } from './handlers/common/index';
import { registerAllUncommonHandlers } from './handlers/uncommon/index';
import { registerAllRareHandlers } from './handlers/rare/index';
import { registerAllSecretHandlers } from './handlers/secret/index';
import { registerAllMythosHandlers } from './handlers/mythos/index';
import { registerAllMissionHandlers } from './handlers/missions/index';
import { registerAllLegendaryHandlers } from './handlers/legendary/index';

export function initializeRegistry(): void {
  registerAllCommonHandlers();
  registerAllUncommonHandlers();
  registerAllRareHandlers();
  registerAllSecretHandlers();
  registerAllMythosHandlers();
  registerAllMissionHandlers();
  registerAllLegendaryHandlers();
}

// Auto-initialize on import
initializeRegistry();
