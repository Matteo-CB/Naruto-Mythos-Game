import { describe, it, expect } from 'vitest';
import { buildPendingTargetSelectionUI } from '@/stores/gameStore';
import type { PendingAction, PendingEffect } from '@/lib/engine/types';

function ecran(type: string) {
  const action = {
    id: 'a1', type: 'SELECT_TARGET', player: 'player1', description: '',
    descriptionKey: 'game.effect.desc.ssDeckSearchTake',
    options: ['inst_1'], minSelections: 1, maxSelections: 1, sourceEffectId: 'e1',
  } as unknown as PendingAction;
  const effet = { id: 'e1', targetSelectionType: type, sourcePlayer: 'player1', sourceCardId: 'SS-004-UC' } as unknown as PendingEffect;
  return buildPendingTargetSelectionUI(
    action, effet, { playerHand: [], playerDiscard: [], playerDeckSize: 0, activeMissions: [] },
    'Andy', () => {}, () => {},
  );
}

describe('un ecran de confirmation est reconnu meme sans souligne final', () => {
  it('les quatre types qui finissent par _CONFIRM sont des confirmations', () => {
    for (const type of ['SS_DECK_SEARCH_CONFIRM', 'SS_PEEK_CONFIRM', 'SS127_CONFIRM', 'SS_TARGETED_POWERUP_CONFIRM']) {
      expect(ecran(type).selectionType, `${type} doit ouvrir une confirmation`).toBe('EFFECT_CONFIRM');
    }
  });

  it('la forme avec souligne au milieu reste reconnue', () => {
    expect(ecran('SS140_CONFIRM_UPGRADE').selectionType).toBe('EFFECT_CONFIRM');
    expect(ecran('AUTO_CONFIRM_INSTANT').selectionType).toBe('EFFECT_CONFIRM');
  });

  it('un ecran de choix normal n est pas pris pour une confirmation', () => {
    expect(ecran('SS_DECK_SEARCH_TAKE').selectionType).not.toBe('EFFECT_CONFIRM');
  });
});
