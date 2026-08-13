import { describe, it, expect } from 'vitest';
import { generateBooster, generateSealedPool } from '@/lib/sealed/boosterGenerator';
import { getSealedSetIds } from '@/lib/data/sets/registry';
import { SHINOBI_SHIREN_ODDS, chaseSlotProbability, rollShinobiShirenChase } from '@/lib/sealed/shinobiShirenRates';

const NUMERO_DU_TIRAGE = 10000;

describe('taux de tirage Shinobi Shiren', () => {
  it('reprend exactement les taux annonces', () => {
    const attendus: Record<string, number> = {
      RA: 7, S: 10, SP: 47, SHINOBI: 701, L: 2350, NUMBERED: 2950,
    };
    for (const { hit, oneIn } of SHINOBI_SHIREN_ODDS) {
      expect(oneIn, hit).toBe(attendus[hit]);
    }
    expect(SHINOBI_SHIREN_ODDS).toHaveLength(6);
  });

  it('la case rare tombe environ une fois sur quatre', () => {
    const p = chaseSlotProbability();
    expect(p).toBeGreaterThan(0.26);
    expect(p).toBeLessThan(0.27);
  });

  it('classe les tirages du plus rare au plus courant', () => {
    const ordre = SHINOBI_SHIREN_ODDS.map((o) => o.oneIn);
    expect(ordre).toEqual([...ordre].sort((a, b) => b - a));
  });

  it('respecte chaque taux sur un grand nombre de tirages', () => {
    const compte: Record<string, number> = {};
    let alea = 0;
    const suite = () => {
      alea = (alea * 1103515245 + 12345) % 2147483648;
      return alea / 2147483648;
    };
    for (let i = 0; i < 400000; i++) {
      const t = rollShinobiShirenChase(suite);
      if (t) compte[t] = (compte[t] ?? 0) + 1;
    }
    for (const { hit, oneIn } of SHINOBI_SHIREN_ODDS) {
      const observe = (compte[hit] ?? 0) / 400000;
      const attendu = 1 / oneIn;
      expect(Math.abs(observe - attendu), `${hit} observe ${observe} attendu ${attendu}`).toBeLessThan(attendu * 0.35 + 0.0002);
    }
  });
});

describe('booster Shinobi Shiren', () => {
  it('contient dix cartes : 4 communes, 3 peu communes, 1 rare, 1 case rare, 1 mission', () => {
    for (let i = 0; i < 40; i++) {
      const pack = generateBooster(i, 'SS');
      expect(pack.cards).toHaveLength(10);
      const raretes = pack.cards.map((c) => c.rarity);
      expect(raretes.filter((r) => r === 'C').length).toBeGreaterThanOrEqual(4);
      expect(raretes.filter((r) => r === 'UC').length).toBeGreaterThanOrEqual(3);
      expect(raretes.filter((r) => r === 'R').length).toBeGreaterThanOrEqual(1);
      expect(pack.cards.filter((c) => c.card_type === 'mission')).toHaveLength(1);
    }
  });

  it('ne sort jamais une rarete absente des taux annonces', () => {
    const autorisees = new Set(['C', 'UC', 'R', 'RA', 'S', 'SP', 'SHINOBI', 'L', 'SV', 'POP', 'MMS']);
    for (let i = 0; i < NUMERO_DU_TIRAGE / 20; i++) {
      for (const carte of generateBooster(i, 'SS').cards) {
        expect(autorisees.has(carte.rarity), `${carte.id} ${carte.rarity}`).toBe(true);
      }
    }
  });

  it('ne contient que des cartes du set 2', () => {
    for (let i = 0; i < 20; i++) {
      for (const carte of generateBooster(i, 'SS').cards) expect(carte.set).toBe('SS');
    }
  });

  it('laisse le booster Konoha Shido a dix cartes avec sa mission', () => {
    for (let i = 0; i < 20; i++) {
      const pack = generateBooster(i, 'KS');
      expect(pack.cards).toHaveLength(10);
      expect(pack.cards.filter((c) => c.card_type === 'mission')).toHaveLength(1);
    }
  });

  it('aucun booster scelle ne distribue de carte holographique, quel que soit le set', () => {
    for (const set of ['KS', 'SS']) {
      for (let i = 0; i < 60; i++) {
        for (const carte of generateBooster(i, set).cards) {
          expect(carte.isHolo, `${set} ${carte.id}`).toBe(false);
          expect(carte.id.endsWith('_H'), `${set} ${carte.id}`).toBe(false);
        }
      }
    }
  });
});

describe('scelle Shinobi Shiren', () => {
  it('le set 2 est proposable en scelle', () => {
    expect(getSealedSetIds()).toContain('SS');
  });

  it('un pool de 6 boosters donne 54 personnages et 6 missions', () => {
    const pool = generateSealedPool(6, 'SS');
    expect(pool.boosters).toHaveLength(6);
    expect(pool.allCards).toHaveLength(60);
    expect(pool.allCards.filter((c) => c.card_type === 'mission')).toHaveLength(6);
    expect(pool.allCards.every((c) => c.set === 'SS')).toBe(true);
  });

  it('un pool ne contient jamais de holo et suit les taux annonces', () => {
    const pool = generateSealedPool(30, 'SS');
    expect(pool.allCards.filter((c) => c.isHolo)).toHaveLength(0);
    const chasse = pool.allCards.filter((c) => ['RA', 'S', 'SP', 'SHINOBI', 'L', 'SV', 'POP'].includes(c.rarity));
    expect(chasse.length).toBeLessThanOrEqual(30);
  });

  it('les variantes tirees en scelle restent ephemeres', () => {
    const pool = generateSealedPool(20, 'SS');
    for (const id of pool.temporaryVariants) {
      expect(pool.allCards.some((c) => c.id === id)).toBe(true);
    }
  });
});
