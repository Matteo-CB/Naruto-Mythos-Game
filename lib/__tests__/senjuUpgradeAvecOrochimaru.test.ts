import { describe, it, expect } from 'vitest';
import { checkFlexibleUpgrade, isUpgradeNameLegal } from '@/lib/engine/rules/PlayValidation';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

const HASHIRAMA = 'SS-129-R';
const TOBIRAMA = 'SS-131-R';
const OROCHIMARU = 'SS-130-R';
const AUTRE = 'KS-001-C';

function carte(id: string): CharacterCard {
  const trouvee = getCardById(id);
  expect(trouvee, `${id} existe`).toBeTruthy();
  return trouvee as unknown as CharacterCard;
}

function plateau(avecOrochimaru: boolean): GameState {
  const p1 = [simChar(AUTRE, { owner: 'player1', instanceId: 'cible' })];
  const p2 = avecOrochimaru ? [simChar(OROCHIMARU, { owner: 'player2', instanceId: 'oro' })] : [];
  const state = buildSimState({ p1, p2, missions: 2, chakra1: 30, edgeHolder: 'player1' });
  state.phase = 'action';
  return state;
}

describe('les deux premiers Hokage ameliorent par-dessus un allie quand Orochimaru est la', () => {
  for (const id of [HASHIRAMA, TOBIRAMA]) {
    it(`${id} peut se poser sur un allie d_un autre nom si Orochimaru est dans la mission`, () => {
      const state = plateau(true);
      expect(
        checkFlexibleUpgrade(carte(id), carte(AUTRE), state, 0),
        'la regle du DUEL autorise l_amelioration libre',
      ).toBe(true);
      expect(
        isUpgradeNameLegal(carte(id), carte(AUTRE), state, 0),
        'le meme verdict passe par le controle de nom',
      ).toBe(true);
    });

    it(`${id} ne peut pas si Orochimaru n_est pas dans la mission`, () => {
      const state = plateau(false);
      expect(checkFlexibleUpgrade(carte(id), carte(AUTRE), state, 0)).toBe(false);
      expect(isUpgradeNameLegal(carte(id), carte(AUTRE), state, 0)).toBe(false);
    });
  }

  it('Orochimaru dans une autre mission ne suffit pas', () => {
    const state = plateau(true);
    expect(checkFlexibleUpgrade(carte(HASHIRAMA), carte(AUTRE), state, 1)).toBe(false);
  });
});
