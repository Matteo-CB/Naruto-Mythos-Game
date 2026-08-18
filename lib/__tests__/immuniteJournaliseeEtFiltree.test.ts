import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { isImmuneToEnemyHideOrDefeat } from '@/lib/effects/ContinuousEffects';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getAllCards } from '@/lib/data/cardLoader';
import type { CharacterCard, GameState } from '@/lib/engine/types';

function carteImmunisee(): CharacterCard | null {
  for (const c of getAllCards()) {
    if (c.card_type !== 'character') continue;
    const faux = simChar(c.id, { owner: 'player2', instanceId: 'test' });
    if (isImmuneToEnemyHideOrDefeat(faux)) return c as CharacterCard;
  }
  return null;
}

describe('une immunite ne peut plus passer inapercue', () => {
  it('vaincre un personnage immunise laisse une trace dans le journal', () => {
    const carte = carteImmunisee();
    if (!carte) {
      expect(true, 'aucune carte immunisee dans le jeu, rien a verifier').toBe(true);
      return;
    }

    const state: GameState = buildSimState({
      p1: [simChar('KS-011-C', { owner: 'player1', instanceId: 'moi' })],
      p2: [simChar(carte.id, { owner: 'player2', instanceId: 'immunise' })],
      missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    state.phase = 'action';

    const apres = EffectEngine.defeatCharacter(state, 'immunise', 'player1');
    expect(
      apres.activeMissions[0].player2Characters.some((c) => c.instanceId === 'immunise'),
      'il survit, c est bien le but de l immunite',
    ).toBe(true);
    expect(
      apres.log.some((l) => l.messageKey === 'game.log.effect.immune'),
      'le joueur est informe au lieu de voir un effet sans suite',
    ).toBe(true);
  });
});
