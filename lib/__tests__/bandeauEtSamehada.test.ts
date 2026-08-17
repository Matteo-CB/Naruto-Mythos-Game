import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { attachCardToCharacter } from '@/lib/effects/attachments';
import { characterHasGroup } from '@/lib/effects/groupUtils';
import { getEffectHandler, initializeRegistry } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { buildPendingTargetSelectionUI } from '@/stores/gameStore';
import type { CardData, GameState, PendingAction, PendingEffect } from '@/lib/engine/types';

void EffectEngine;

const BANDEAU_KONOHA = 'SS-091-C';
const HIRUZEN = 'KS-001-C';
const ETRANGER = 'SS-051-UC';

function plateau(avecBandeau: boolean): GameState {
  let state = buildSimState({
    p1: [
      simChar(HIRUZEN, { owner: 'player1', instanceId: 'hiruzen' }),
      simChar(ETRANGER, { owner: 'player1', instanceId: 'etranger' }),
    ],
    missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  state.phase = 'action';
  if (avecBandeau) {
    state = attachCardToCharacter(state, 'player1', getCardById(BANDEAU_KONOHA) as CardData, 'etranger');
  }
  return state;
}

function hiruzenTrouveUneCible(state: GameState): boolean {
  initializeRegistry();
  const handler = getEffectHandler(HIRUZEN, 'MAIN')!;
  const source = state.activeMissions[0].player1Characters[0];
  const r = handler({ state, sourcePlayer: 'player1', sourceCard: source, sourceMissionIndex: 0, isUpgrade: false } as never);
  return !!r.requiresTargetSelection;
}

describe('le BANDEAU DE KONOHA 091 rend vraiment son porteur Village de Konoha', () => {
  it('le porteur gagne le groupe', () => {
    const avec = plateau(true);
    const porteur = avec.activeMissions[0].player1Characters.find((c) => c.instanceId === 'etranger')!;
    expect(characterHasGroup(porteur, 'Leaf Village'), 'le groupe est accorde').toBe(true);
  });

  it('un effet qui cherche des Konoha le voit desormais', () => {
    expect(hiruzenTrouveUneCible(plateau(false)), 'sans bandeau, aucun allie Konoha a renforcer').toBe(false);
    expect(hiruzenTrouveUneCible(plateau(true)), 'avec le bandeau, le porteur devient une cible').toBe(true);
  });
});

describe('SAMEHADA 090 affiche des montants lisibles et cliquables', () => {
  it('les choix ne sont plus des NaN et portent leur cible', () => {
    const action = {
      id: 'a1', type: 'CHOOSE_CARD_FROM_LIST', player: 'player1', description: '',
      descriptionKey: 'game.effect.desc.ss090ChooseAmount',
      options: ['AMOUNT_1', 'AMOUNT_2', 'AMOUNT_3'],
      minSelections: 1, maxSelections: 1, sourceEffectId: 'e1',
    } as unknown as PendingAction;
    const effet = { id: 'e1', targetSelectionType: 'SS090_CHOOSE_AMOUNT', sourcePlayer: 'player1' } as unknown as PendingEffect;

    const ui = buildPendingTargetSelectionUI(
      action, effet, { playerHand: [], playerDiscard: [], playerDeckSize: 0, activeMissions: [] },
      'Andy', () => {}, () => {},
    );
    const choix = ui.handCards ?? [];
    expect(choix.length, 'trois montants').toBe(3);
    expect(choix.map((c) => c.card.name_fr).join(' '), 'aucun NaN affiche').not.toContain('NaN');
    expect(choix.map((c) => c.targetId), 'chaque choix sait ce qu il envoie').toEqual(['AMOUNT_1', 'AMOUNT_2', 'AMOUNT_3']);
  });
});
