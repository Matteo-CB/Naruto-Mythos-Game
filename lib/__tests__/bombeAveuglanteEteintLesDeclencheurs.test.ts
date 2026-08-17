import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { attachCardToCharacter } from '@/lib/effects/attachments';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData, GameState } from '@/lib/engine/types';

const BOMBE = 'SS-083-UC';
const TSUNADE = 'KS-003-C';
const VICTIME = 'KS-001-C';

function plateau(): GameState {
  const state = buildSimState({
    p1: [
      simChar(TSUNADE, { owner: 'player1', instanceId: 'tsunade' }),
      simChar(VICTIME, { owner: 'player1', instanceId: 'victime' }),
    ],
    p2: [simChar(VICTIME, { owner: 'player2', instanceId: 'bourreau' })],
    missions: 2,
    chakra1: 0,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  state.player1.chakra = 0;
  return state;
}

describe('la Bombe Aveuglante eteint aussi les effets declenches', () => {
  it('sans bombe, Tsunade donne bien son chakra quand un allie est vaincu', () => {
    const apres = EffectEngine.defeatCharacter(plateau(), 'victime', 'player2');
    expect(apres.player1.chakra, 'le declencheur de Tsunade fonctionne').toBeGreaterThan(0);
  });

  it('avec la bombe sur Tsunade, son texte est efface et rien ne se declenche', () => {
    let state = plateau();
    state = attachCardToCharacter(state, 'player2', getCardById(BOMBE) as CardData, 'tsunade');

    const apres = EffectEngine.defeatCharacter(state, 'victime', 'player2');
    expect(
      apres.player1.chakra,
      'un texte efface ne declenche plus rien, y compris sur une defaite',
    ).toBe(0);
  });
});
