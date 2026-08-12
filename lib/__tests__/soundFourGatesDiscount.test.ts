import { describe, it, expect } from 'vitest';
import { createActionPhaseState, mockCharInPlay, mockMission } from './testHelpers';
import { calculateEffectiveCost, perAllyDiscountKeyword } from '@/lib/engine/rules/ChakraValidation';
import { getCardById } from '@/lib/data/cardIndex';
import type { GameState, CharacterCard, CharacterInPlay } from '@/lib/engine/types';

const JIROBO = 'SS-032-C';
const KIDOMARU = 'SS-034-C';
const SAKON = 'SS-036-C';

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

describe('les trois Portes des Quatre du Son coutent 1 de moins par allie Sound Four', () => {
  it('les trois cartes declarent bien la reduction, lue depuis leur texte', () => {
    for (const id of [JIROBO, KIDOMARU, SAKON]) {
      const carte = getCardById(id) as CharacterCard;
      expect(perAllyDiscountKeyword(carte), id).toBe('Sound Four');
    }
  });

  it('sans allie Sound Four, le cout imprime est preleve', () => {
    const s = plateau();
    const carte = getCardById(KIDOMARU) as CharacterCard;
    expect(calculateEffectiveCost(s, 'player1', carte, 0, false)).toBe(3);
  });

  it('chaque allie Sound Four de la mission retire 1', () => {
    const s = plateau();
    const carte = getCardById(KIDOMARU) as CharacterCard;

    s.activeMissions[0].player1Characters = [soundFour('a', 'JIRÔBÔ')];
    expect(calculateEffectiveCost(s, 'player1', carte, 0, false)).toBe(2);

    s.activeMissions[0].player1Characters.push(soundFour('b', 'SAKON'));
    expect(calculateEffectiveCost(s, 'player1', carte, 0, false)).toBe(1);
  });

  it('le prix depend de la mission visee, pas du plateau entier', () => {
    const s = plateau();
    const carte = getCardById(KIDOMARU) as CharacterCard;
    s.activeMissions[0].player1Characters = [soundFour('a', 'JIRÔBÔ'), soundFour('b', 'SAKON')];

    expect(calculateEffectiveCost(s, 'player1', carte, 0, false)).toBe(1);
    expect(calculateEffectiveCost(s, 'player1', carte, 1, false)).toBe(3);
  });

  it('un Sound Four ennemi ne reduit rien', () => {
    const s = plateau();
    const carte = getCardById(KIDOMARU) as CharacterCard;
    s.activeMissions[0].player2Characters = [soundFour('e', 'JIRÔBÔ', 'player2')];
    expect(calculateEffectiveCost(s, 'player1', carte, 0, false)).toBe(3);
  });

  it('un allie cache ne compte pas, il n a aucun mot-cle visible', () => {
    const s = plateau();
    const carte = getCardById(KIDOMARU) as CharacterCard;
    s.activeMissions[0].player1Characters = [soundFour('c', 'JIRÔBÔ', 'player1', true)];
    expect(calculateEffectiveCost(s, 'player1', carte, 0, false)).toBe(3);
  });

  it('un allie sans le mot-cle Sound Four ne compte pas', () => {
    const s = plateau();
    const carte = getCardById(KIDOMARU) as CharacterCard;
    s.activeMissions[0].player1Characters = [
      mockCharInPlay({ instanceId: 'x', controlledBy: 'player1', originalOwner: 'player1' }, { name_fr: 'DOSU KINUTA', power: 3, keywords: ['Team Dosu'] }),
    ];
    expect(calculateEffectiveCost(s, 'player1', carte, 0, false)).toBe(3);
  });

  it('la cible d evolution, de meme nom, ne se compte pas elle-meme', () => {
    const s = plateau();
    const carte = getCardById(KIDOMARU) as CharacterCard;
    s.activeMissions[0].player1Characters = [soundFour('base', 'KIDÔMARU')];
    expect(calculateEffectiveCost(s, 'player1', carte, 0, false)).toBe(3);
  });

  it('le cout ne descend jamais sous zero', () => {
    const s = plateau();
    const carte = getCardById(JIROBO) as CharacterCard;
    s.activeMissions[0].player1Characters = [
      soundFour('a', 'SAKON'), soundFour('b', 'TAYUYA'), soundFour('c', 'KIDÔMARU'), soundFour('d', 'KIMIMARO'),
    ];
    expect(calculateEffectiveCost(s, 'player1', carte, 0, false)).toBe(0);
  });

  it('la reduction vaut aussi a la revelation', () => {
    const s = plateau();
    const carte = getCardById(SAKON) as CharacterCard;
    s.activeMissions[0].player1Characters = [soundFour('a', 'JIRÔBÔ')];
    expect(calculateEffectiveCost(s, 'player1', carte, 0, true)).toBe(2);
  });

  it('une carte sans ce texte n est pas touchee', () => {
    const s = plateau();
    const carte = getCardById('SS-042-UC') as CharacterCard;
    s.activeMissions[0].player1Characters = [soundFour('a', 'JIRÔBÔ'), soundFour('b', 'SAKON')];
    expect(calculateEffectiveCost(s, 'player1', carte, 0, false)).toBe(4);
  });
});
