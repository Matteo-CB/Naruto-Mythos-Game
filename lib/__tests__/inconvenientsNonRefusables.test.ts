import { describe, it, expect } from 'vitest';
import { effetInstantOptionnel, adversaireEstLeSujet } from '@/lib/effects/autoConfirmRules';
import { getAllCards } from '@/lib/data/cardLoader';

describe('un effet dont l adversaire est le sujet ne peut pas etre refuse', () => {
  it('les deux cartes signalees ne sont plus passables', () => {
    expect(effetInstantOptionnel('[↯] Opponent gains 1 Chakra.', 'MAIN'), 'Zaku Abumi 070').toBe(false);
    expect(effetInstantOptionnel('[↯] Opponent draws a card.', 'MAIN'), 'Kin Tsuchi 072').toBe(false);
  });

  it('un effet ou l adversaire subit apres MON choix reste facultatif', () => {
    expect(
      effetInstantOptionnel('[↯] Defeat an enemy character in this mission. If you do so, the opponent draws a card.', 'AMBUSH'),
      'le choix de vaincre reste le mien',
    ).toBe(true);
  });

  it('un effet normal reste facultatif', () => {
    expect(effetInstantOptionnel('[↯] POWERUP 2.', 'FIRST_STRIKE')).toBe(true);
    expect(effetInstantOptionnel('[↯] Draw a card.', 'MAIN')).toBe(true);
  });

  it('les effets continus et obligatoires restent hors du champ', () => {
    expect(effetInstantOptionnel('[⧗] Every enemy has -1 Power.', 'MAIN')).toBe(false);
    expect(effetInstantOptionnel('[↯] You MUST defeat a friendly character.', 'MAIN')).toBe(false);
  });

  it('le prefixe DUEL ne masque pas le sujet', () => {
    expect(
      adversaireEstLeSujet('[↯] DUEL Kurenai Yuhi: The opponent chooses and defeats their characters.'),
      'le sujet reste l adversaire malgre le prefixe',
    ).toBe(true);
  });

  it('recense les effets du jeu ou l adversaire est le sujet', () => {
    const trouves = getAllCards().flatMap((c) =>
      (c.effects ?? [])
        .filter((e) => !e.description.includes('[⧗]') && adversaireEstLeSujet(e.description))
        .map(() => c.id));
    expect(trouves.length, 'le jeu en contient bien plusieurs').toBeGreaterThan(5);
  });
});
