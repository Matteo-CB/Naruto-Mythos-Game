import { describe, it, expect } from 'vitest';
import { buildPendingTargetSelectionUI } from '@/stores/gameStore';
import type { PendingAction, PendingEffect } from '@/lib/engine/types';

const action = {
  id: 'a1',
  type: 'CHOOSE_CARD_FROM_LIST',
  player: 'player1',
  description: '',
  descriptionKey: 'game.effect.desc.ss090ChooseAmount',
  options: ['1', '2', '3'],
  minSelections: 1,
  maxSelections: 1,
  sourceEffectId: 'e1',
} as unknown as PendingAction;

const effet = {
  id: 'e1',
  targetSelectionType: 'SS090_CHOOSE_AMOUNT',
  sourcePlayer: 'player1',
} as unknown as PendingEffect;

describe('Samehada 090 demande un nombre de jetons, pas une carte de la main', () => {
  it('les choix affichent le nombre de jetons et jamais des points d interrogation', () => {
    const ui = buildPendingTargetSelectionUI(
      action, effet,
      { playerHand: [], playerDiscard: [], playerDeckSize: 0, activeMissions: [] },
      'DashTidus', () => {}, () => {},
    );
    const noms = (ui.handCards ?? []).map((h) => h.card.name_fr);
    expect(noms.length, 'les trois montants sont proposes').toBe(3);
    expect(noms, 'aucun choix illisible').not.toContain('???');
    expect(noms[0], 'le libelle annonce le vol de jetons').toContain('1');
  });
});
