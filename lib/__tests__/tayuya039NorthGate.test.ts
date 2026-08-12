import { describe, it, expect, beforeAll } from 'vitest';
import { createActionPhaseState, mockCharInPlay, mockMission } from './testHelpers';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { calculateEffectiveCost, perAllyDiscountKeyword } from '@/lib/engine/rules/ChakraValidation';
import { getCardById } from '@/lib/data/cardIndex';
import type { GameState, CharacterCard, CharacterInPlay } from '@/lib/engine/types';

const TAYUYA = 'SS-039-C';

function plateau(missions = 2): GameState {
  const s = createActionPhaseState();
  s.activeMissions = Array.from({ length: missions }, (_, i) => ({
    card: mockMission({ basePoints: 3 + i }),
    rank: 'D' as const,
    basePoints: 3 + i,
    rankBonus: 1,
    player1Characters: [] as CharacterInPlay[],
    player2Characters: [] as CharacterInPlay[],
    wonBy: null,
  }));
  return s;
}

function soundFour(instanceId: string, nom: string, camp: 'player1' | 'player2' = 'player1', cache = false): CharacterInPlay {
  return mockCharInPlay(
    { instanceId, controlledBy: camp, originalOwner: camp, isHidden: cache },
    { name_fr: nom, name_en: nom, power: 2, keywords: ['Sound Four'] },
  );
}

beforeAll(() => registerAllSetHandlers());

describe('Tayuya 039, Porte Nord des Quatre du Son', () => {
  it('porte les valeurs imprimees sur la carte', () => {
    const c = getCardById(TAYUYA) as CharacterCard;
    expect(c.chakra).toBe(2);
    expect(c.power).toBe(1);
    expect(c.keywords).toContain('Sound Four');
    expect(c.group).toBe('Sound Village');
  });

  it('partage la reduction des trois autres Portes, lue depuis son texte', () => {
    expect(perAllyDiscountKeyword(getCardById(TAYUYA) as CharacterCard)).toBe('Sound Four');
  });

  it('coute 1 de moins par Quatre du Son allie de la mission visee', () => {
    const s = plateau();
    const carte = getCardById(TAYUYA) as CharacterCard;
    expect(calculateEffectiveCost(s, 'player1', carte, 0, false)).toBe(2);

    s.activeMissions[0].player1Characters = [soundFour('a', 'SAKON')];
    expect(calculateEffectiveCost(s, 'player1', carte, 0, false)).toBe(1);

    s.activeMissions[0].player1Characters.push(soundFour('b', 'JIRÔBÔ'));
    expect(calculateEffectiveCost(s, 'player1', carte, 0, false)).toBe(0);
  });

  it('ne descend jamais sous zero', () => {
    const s = plateau();
    const carte = getCardById(TAYUYA) as CharacterCard;
    s.activeMissions[0].player1Characters = [
      soundFour('a', 'SAKON'), soundFour('b', 'JIRÔBÔ'), soundFour('c', 'KIDÔMARU'),
    ];
    expect(calculateEffectiveCost(s, 'player1', carte, 0, false)).toBe(0);
  });

  it('ignore un allie cache et un Quatre du Son ennemi', () => {
    const s = plateau();
    const carte = getCardById(TAYUYA) as CharacterCard;
    s.activeMissions[0].player1Characters = [soundFour('cache', 'SAKON', 'player1', true)];
    s.activeMissions[0].player2Characters = [soundFour('ennemi', 'JIRÔBÔ', 'player2')];
    expect(calculateEffectiveCost(s, 'player1', carte, 0, false)).toBe(2);
  });

  it('sa premiere frappe donne 2 chakra et le journalise', () => {
    const s = plateau();
    s.player1.chakra = 4;
    const source = mockCharInPlay(
      { instanceId: 'src', controlledBy: 'player1', originalOwner: 'player1' },
      { id: TAYUYA, name_fr: 'TAYUYA', name_en: 'TAYUYA', chakra: 2, power: 1, keywords: ['Sound Four'] },
    );
    s.activeMissions[0].player1Characters = [source];

    const res = getEffectHandler(TAYUYA, 'FIRST_STRIKE')!({
      state: s, sourcePlayer: 'player1', sourceCard: source, sourceMissionIndex: 0,
    } as never);

    expect(res.state.player1.chakra).toBe(6);
    expect(res.requiresTargetSelection).toBeFalsy();
    const derniere = res.state.log[res.state.log.length - 1];
    expect(derniere.messageKey).toBe('game.log.effect.gainChakra');
    expect(derniere.messageParams?.amount).toBe('2');
  });

  it('n ouvre aucune fenetre, il n y a rien a choisir', () => {
    const s = plateau();
    const source = mockCharInPlay(
      { instanceId: 'src', controlledBy: 'player1', originalOwner: 'player1' },
      { id: TAYUYA, name_fr: 'TAYUYA', chakra: 2, power: 1 },
    );
    s.activeMissions[0].player1Characters = [source];

    const res = getEffectHandler(TAYUYA, 'FIRST_STRIKE')!({
      state: s, sourcePlayer: 'player1', sourceCard: source, sourceMissionIndex: 0,
    } as never);
    expect(res.targetSelectionType).toBeUndefined();
  });
});
