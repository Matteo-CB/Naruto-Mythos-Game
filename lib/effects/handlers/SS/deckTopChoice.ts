import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { apercuDeCartes } from './deckPreview';

export const EBISU_023 = 'SS-023-C';
export const IBIKI_028 = 'SS-028-UC';

interface ChoixDeSommet {
  id: string;
  nom: string;
  proprietaire: 'self' | 'opponent';
  selectionType: string;
  descriptionKey: string;
  refus: string;
}

export const CHOIX_DE_SOMMET: ChoixDeSommet[] = [
  {
    id: EBISU_023,
    nom: 'EBISU',
    proprietaire: 'self',
    selectionType: 'SS023_TOP_OR_BOTTOM',
    descriptionKey: 'game.effect.desc.ss023TopOrBottom',
    refus: 'your deck is empty.',
  },
  {
    id: IBIKI_028,
    nom: 'IBIKI MORINO',
    proprietaire: 'opponent',
    selectionType: 'SS028_BOTTOM_OR_KEEP',
    descriptionKey: 'game.effect.desc.ss028BottomOrKeep',
    refus: 'the opponent deck is empty.',
  },
];

export function proprietaireDuDeck(choix: ChoixDeSommet, player: PlayerID): PlayerID {
  if (choix.proprietaire === 'self') return player;
  return player === 'player1' ? 'player2' : 'player1';
}

function refus(state: GameState, player: PlayerID, texte: string, nom: string, id: string): EffectResult {
  return {
    state: {
      ...state,
      log: logAction(state.log, state.turn, state.phase, player, 'EFFECT_NO_TARGET', texte,
        'game.log.effect.noTarget', { card: nom, id }),
    },
  };
}

function choixHandler(choix: ChoixDeSommet) {
  return (ctx: EffectContext): EffectResult => {
    const { state, sourcePlayer } = ctx;
    const proprietaire = proprietaireDuDeck(choix, sourcePlayer);
    if (state[proprietaire].deck.length === 0) {
      return refus(state, sourcePlayer, `${choix.nom} (${choix.id}): ${choix.refus}`, choix.nom, choix.id);
    }
    return {
      state,
      requiresTargetSelection: true,
      targetSelectionType: choix.selectionType,
      validTargets: ['DECK_0'],
      isOptional: true,
      description: JSON.stringify({ cards: apercuDeCartes(state, proprietaire, [0]) }),
      descriptionKey: choix.descriptionKey,
    };
  };
}

export function registerDeckTopChoiceHandlers(): void {
  for (const choix of CHOIX_DE_SOMMET) {
    registerEffect(choix.id, 'MAIN', choixHandler(choix));
  }
}
