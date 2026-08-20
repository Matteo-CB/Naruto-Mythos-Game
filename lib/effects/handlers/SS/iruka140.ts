import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CardData, CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { confirmFirst } from './confirmFirst';
import { findHiddenOnBoardByPredicate, type HiddenCharTarget } from '@/lib/effects/handlers/KS/shared/summonSearch';

export const IRUKA_140 = 'SS-140-R';
export const IRUKA_140_VARIANTS = [IRUKA_140];
export const IRUKA_140_REDUCTION = 2;
export const NARUTO_UZUMAKI = 'NARUTO UZUMAKI';

function topOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

function porteLeNomDeNaruto(carte: CardData | null | undefined): boolean {
  if (!carte) return false;
  return `${carte.name_fr ?? ''} ${carte.name_en ?? ''}`.toUpperCase().includes(NARUTO_UZUMAKI);
}

function refus(state: GameState, player: PlayerID, texte: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', texte,
        'game.log.effect.noTarget', { card: 'IRUKA UMINO', id: IRUKA_140 }),
    },
  };
}

export function narutosEnJeu(state: GameState): CharacterInPlay[] {
  const trouves: CharacterInPlay[] = [];
  for (const mission of state.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const c of mission[side]) {
        if (c.isHidden) continue;
        if (porteLeNomDeNaruto(topOf(c) as unknown as CardData)) trouves.push(c);
      }
    }
  }
  return trouves;
}

function iruka140Main(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const cibles = narutosEnJeu(state);
  if (cibles.length === 0) {
    return refus(state, sourcePlayer, 'Iruka Umino (140): no visible Naruto Uzumaki in play.');
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS140_HIDE_NARUTO',
    validTargets: cibles.map((c) => c.instanceId),
    isOptional: true,
    description: JSON.stringify({}),
    descriptionKey: 'game.effect.desc.ss140HideNaruto',
  }, sourceCard.instanceId, 'SS140_CONFIRM_MAIN');
}

export function narutosCachesRevelables(
  state: GameState,
  player: PlayerID,
  reduction: number,
): HiddenCharTarget[] {
  return findHiddenOnBoardByPredicate(
    state,
    player,
    (carte) => porteLeNomDeNaruto(carte as unknown as CardData),
    reduction,
  );
}

function iruka140Upgrade(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const caches = narutosCachesRevelables(state, sourcePlayer, IRUKA_140_REDUCTION);
  if (caches.length === 0) {
    return refus(state, sourcePlayer,
      'Iruka Umino (140) UPGRADE: no hidden Naruto Uzumaki you can reveal.');
  }
  return confirmFirst({
    state,
    requiresTargetSelection: true,
    targetSelectionType: 'SS140_PLAY_HIDDEN',
    validTargets: caches.map((h) => `HIDDEN_${h.instanceId}`),
    isOptional: true,
    description: JSON.stringify({ reduction: IRUKA_140_REDUCTION, hiddenChars: caches }),
    descriptionKey: 'game.effect.desc.ss140PlayHidden',
  }, sourceCard.instanceId, 'SS140_CONFIRM_UPGRADE');
}

export function registerIruka140Handlers(): void {
  for (const id of IRUKA_140_VARIANTS) {
    registerEffect(id, 'MAIN', iruka140Main);
    registerEffect(id, 'UPGRADE', iruka140Upgrade);
  }
}
