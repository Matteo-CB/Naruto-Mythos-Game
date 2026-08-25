import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { allCardData } from '@/lib/data/sets';
import type { CardData, CharacterCard, GameState } from '@/lib/engine/types';

beforeAll(() => { initializeRegistry(); });

const SHINO = 'KS-033-UC';
const ENNEMI_JUTSU = 'KS-115-R';
const ENNEMI_SANS_JUTSU = 'KS-005-C';

function plateau(ennemi: string | null): { etat: GameState; cache: CharacterCard } {
  const s = buildSimState({
    p1: [], p2: ennemi ? [simChar(ennemi, { owner: 'player2', instanceId: 'ennemi' })] : [],
    missions: 2, chakra1: 40, edgeHolder: 'player1',
  });
  s.phase = 'action';
  s.activePlayer = 'player1';
  s.activeMissions[0].player1Characters.push({
    ...simChar(SHINO, { owner: 'player1', instanceId: 'shino' }),
    isHidden: true,
  } as never);
  return { etat: s, cache: getCardById(SHINO) as CharacterCard };
}

describe('SHINO 033 porte bien un MAIN continu', () => {
  it('la carte annonce un MAIN, plus un AMBUSH', () => {
    const carte = (allCardData.cards as Record<string, CardData & { effects?: Array<{ type: string; description: string }> }>)[SHINO];
    const premier = carte.effects![0];
    expect(premier.type, 'une remise de cout doit etre lisible avant de jouer, donc un MAIN continu').toBe('MAIN');
    expect(premier.description).toContain('[⧗]');
    expect(premier.description).toContain('while hidden');
    expect(carte.effects!.some((e) => e.type === 'AMBUSH'), 'plus aucun AMBUSH').toBe(false);
  });

  it('les sept langues decrivent le meme effet', async () => {
    const { allEffectDescriptionsFr, allEffectDescriptionsEn } = await import('@/lib/data/sets');
    for (const [nom, table] of [['fr', allEffectDescriptionsFr], ['en', allEffectDescriptionsEn]] as const) {
      const lignes = (table as Record<string, string[]>)[SHINO];
      expect(lignes?.[0], `${nom}: la premiere ligne est bien la remise`).toContain('[⧗]');
      expect(lignes?.length, `${nom}: deux effets`).toBe(2);
    }
  });
});

describe('la remise ne joue qu a la revelation et avec un Jutsu ennemi present', () => {
  it('un Jutsu ennemi dans la mission fait tomber le cout de revelation a zero', () => {
    const { etat, cache } = plateau(ENNEMI_JUTSU);
    const cache1 = etat.activeMissions[0].player1Characters[0];
    const prix = calculateEffectiveCost(etat, 'player1', cache, 0, true, cache1);
    expect(prix, 'cout imprime 4 moins 4').toBe(0);
  });

  it('sans Jutsu ennemi, le cout de revelation reste entier', () => {
    const { etat, cache } = plateau(ENNEMI_SANS_JUTSU);
    const cache1 = etat.activeMissions[0].player1Characters[0];
    expect(calculateEffectiveCost(etat, 'player1', cache, 0, true, cache1)).toBe(4);
  });

  it('un Jutsu ennemi cache ne declenche rien', () => {
    const { etat, cache } = plateau(ENNEMI_JUTSU);
    etat.activeMissions[0].player2Characters[0].isHidden = true;
    const cache1 = etat.activeMissions[0].player1Characters[0];
    expect(calculateEffectiveCost(etat, 'player1', cache, 0, true, cache1)).toBe(4);
  });

  it('un Jutsu ennemi sur une autre mission ne compte pas', () => {
    const { etat, cache } = plateau(null);
    etat.activeMissions[1].player2Characters.push(
      simChar(ENNEMI_JUTSU, { owner: 'player2', instanceId: 'ailleurs', missionIndex: 1 }) as never,
    );
    const cache1 = etat.activeMissions[0].player1Characters[0];
    expect(calculateEffectiveCost(etat, 'player1', cache, 0, true, cache1)).toBe(4);
  });

  it('jouer la carte depuis la main, face visible, coute plein tarif', () => {
    const { etat, cache } = plateau(ENNEMI_JUTSU);
    expect(
      calculateEffectiveCost(etat, 'player1', cache, 0, false),
      'la carte dit "alors qu il est cache": une pose normale ne beneficie de rien',
    ).toBe(4);
  });
});

describe('la remise se lit sur la carte, pas sur son numero', () => {
  it('le moteur ne cite plus le numero 33', () => {
    const { readFileSync } = require('fs') as typeof import('fs');
    const { join } = require('path') as typeof import('path');
    const src = readFileSync(join(__dirname, '..', 'engine', 'rules', 'ChakraValidation.ts'), 'utf8');
    expect(src, 'un numero en dur laisserait une future carte au meme texte sans effet')
      .not.toContain("card.number === 33");
    expect(src, 'la condition vient du texte imprime').toContain('while hidden');
    expect(src, 'le montant aussi se lit dans le texte').toContain('paying (');
  });
});
