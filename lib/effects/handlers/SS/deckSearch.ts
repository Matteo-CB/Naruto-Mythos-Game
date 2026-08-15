import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CardData, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { confirmFirst } from './confirmFirst';

export interface FouilleDeDeck {
  id: string;
  nom: string;
  profondeur: number;
  accepte: (carte: CardData) => boolean;
  refus: string;
}

export const FOUILLES: FouilleDeDeck[] = [
  {
    id: 'SS-004-UC',
    nom: 'JIRAIYA',
    profondeur: 3,
    accepte: (c) => (c.keywords ?? []).includes('Sannin'),
    refus: 'no Sannin character among the top 3 cards.',
  },
  {
    id: 'SS-058-UC',
    nom: 'FUGAKU UCHIWA',
    profondeur: 3,
    accepte: (c) => `${c.name_fr ?? ''} ${c.name_en ?? ''}`.toUpperCase().includes('UCHI'),
    refus: 'no Uchiha-named character among the top 3 cards.',
  },
  {
    id: 'SS-074-C',
    nom: 'SUIKO',
    profondeur: 5,
    accepte: (c) => c.card_type === 'attachment'
      && ((c.keywords ?? []).includes('Weapon') || (c.keywords ?? []).includes('Armor')),
    refus: 'no Weapon or Armor attachment among the top 5 cards.',
  },
];

export function candidatsDeFouille(
  state: GameState,
  player: PlayerID,
  fouille: FouilleDeDeck,
): number[] {
  const deck = state[player].deck as unknown as CardData[];
  const indices: number[] = [];
  for (let i = 0; i < Math.min(fouille.profondeur, deck.length); i++) {
    if (fouille.accepte(deck[i])) indices.push(i);
  }
  return indices;
}

function fouilleHandler(fouille: FouilleDeDeck) {
  return (ctx: EffectContext): EffectResult => {
    const { state, sourcePlayer, sourceCard } = ctx;
    const candidats = candidatsDeFouille(state, sourcePlayer, fouille);
    if (candidats.length === 0) {
      return {
        state: {
          ...state,
          log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
            `${fouille.nom} (${fouille.id}): ${fouille.refus}`,
            'game.log.effect.noTarget', { card: fouille.nom, id: fouille.id }),
        },
      };
    }

    return confirmFirst({
      state,
      requiresTargetSelection: true,
      targetSelectionType: 'SS_DECK_SEARCH_TAKE',
      validTargets: candidats.map((i) => `DECK_${i}`),
      isOptional: true,
      description: JSON.stringify({ depth: fouille.profondeur, sourceName: fouille.nom, sourceId: fouille.id }),
      descriptionKey: 'game.effect.desc.ssDeckSearchTake',
    }, sourceCard.instanceId, 'SS_DECK_SEARCH_CONFIRM');
  };
}

export function registerDeckSearchHandlers(): void {
  for (const fouille of FOUILLES) {
    registerEffect(fouille.id, 'MAIN', fouilleHandler(fouille));
  }
}
