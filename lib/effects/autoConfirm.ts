import type { EffectType, GameState, PlayerID } from '@/lib/engine/types';
import type { EffectResult } from '@/lib/effects/EffectTypes';

export const AUTO_CONFIRM_INSTANT = 'AUTO_CONFIRM_INSTANT';

const TYPES_CONCERNES: EffectType[] = ['MAIN', 'AMBUSH', 'UPGRADE', 'DUEL', 'FIRST_STRIKE'];

export function effetInstantOptionnel(description: string, type: EffectType): boolean {
  if (description.includes('[⧗]')) return false;
  if (/\bMUST\b/i.test(description)) return false;
  return TYPES_CONCERNES.includes(type);
}

function signature(state: GameState): string {
  const morceaux: Array<string | number> = [];
  for (const camp of ['player1', 'player2'] as PlayerID[]) {
    const ps = state[camp];
    morceaux.push(ps.chakra, ps.hand.length, ps.deck.length, ps.discardPile.length, ps.missionPoints);
  }
  for (const mission of state.activeMissions ?? []) {
    morceaux.push((mission.attachments ?? []).length, String(mission.wonBy ?? ''));
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const liste = mission[side] ?? [];
      morceaux.push(liste.length);
      for (const c of liste) {
        morceaux.push(c.instanceId, c.isHidden ? 1 : 0, c.powerTokens, c.stack?.length ?? 0, (c.attachments ?? []).length, c.controlledBy);
      }
    }
  }
  morceaux.push(state.pendingEffects.length, state.pendingActions.length, state.edgeHolder);
  return morceaux.join('|');
}

export function aChangeLeJeu(avant: GameState, apres: GameState): boolean {
  if (avant === apres) return false;
  return signature(avant) !== signature(apres);
}

export function confirmationAutomatique(
  state: GameState,
  sourceInstanceId: string,
  cardId: string,
  effectType: EffectType,
): EffectResult {
  return {
    state,
    requiresTargetSelection: true,
    targetSelectionType: AUTO_CONFIRM_INSTANT,
    validTargets: [sourceInstanceId],
    isOptional: true,
    isMandatory: false,
    description: JSON.stringify({ cardId, effectType }),
    descriptionKey: 'game.effect.desc.autoConfirmInstant',
  };
}

export function envelopperSiApplicationDirecte(
  resultat: EffectResult,
  avant: GameState,
  description: string,
  effectType: EffectType,
  sourceInstanceId: string,
  cardId: string,
): EffectResult {
  if (resultat.requiresTargetSelection) return resultat;
  if (!effetInstantOptionnel(description, effectType)) return resultat;
  if (!sourceInstanceId) return resultat;
  if (!aChangeLeJeu(avant, resultat.state)) return resultat;
  return confirmationAutomatique(avant, sourceInstanceId, cardId, effectType);
}

export function envelopperResultat(
  resultat: EffectResult,
  ctx: { state: GameState; sourceCard?: { instanceId?: string; card?: { id?: string; effects?: Array<{ type: string; description: string }> }; stack?: Array<{ id?: string; effects?: Array<{ type: string; description: string }> }> } },
  effectType: EffectType,
): EffectResult {
  const source = ctx.sourceCard;
  if (!source?.instanceId) return resultat;
  const sommet = source.stack && source.stack.length > 0 ? source.stack[source.stack.length - 1] : source.card;
  if (!sommet?.id) return resultat;
  const effet = (sommet.effects ?? []).find((e) => e.type === effectType);
  if (!effet) return resultat;
  return envelopperSiApplicationDirecte(
    resultat, ctx.state, effet.description, effectType, source.instanceId, sommet.id,
  );
}
