import { describe, it, expect, beforeEach } from 'vitest';
import { tauxDuBoosterVariante, poidsDeLaCarte, PART_HOLO_C, PART_HOLO_UC } from '@/lib/variants/rates';
import { SHINOBI_SHIREN_ODDS } from '@/lib/sealed/shinobiShirenRates';
import { rollVariantBooster } from '@/lib/variants/rollBooster';
import { mulberry32 } from '@/lib/variants/rng';
import { eligibleVariantsForSetByRarity, clearVariantPoolCache } from '@/lib/variants/variantPool';

// Les viviers sont mis en cache au premier tirage: un autre fichier de test peut les avoir
// remplis avec un catalogue different, donc on repart d un cache vide.
beforeEach(() => { clearVariantPoolCache(); });

describe('le booster variante suit les taux du set qu il ouvre', () => {
  for (const setId of ['SS', 'KS']) {
    it(`${setId}: les probabilites forment un tout`, () => {
      const somme = Object.values(tauxDuBoosterVariante(setId)).reduce((t, p) => t + (p ?? 0), 0);
      expect(somme, 'les cases se partagent exactement le paquet').toBeCloseTo(1, 6);
    });
  }

  it('le set 2 garde l ordre de rarete officiel', () => {
    const t = tauxDuBoosterVariante('SS');
    const attendu = ['RA', 'MV', 'SPV', 'SHINOBIV', 'L', 'SV'] as const;
    for (let i = 0; i < attendu.length - 1; i += 1) {
      expect(
        t[attendu[i]] ?? 0,
        `${attendu[i]} doit rester plus courant que ${attendu[i + 1]}`,
      ).toBeGreaterThan(t[attendu[i + 1]] ?? 0);
    }
  });

  it('chaque rarete du set 2 reste proche de sa chance officielle', () => {
    const t = tauxDuBoosterVariante('SS');
    const officiel = new Map(SHINOBI_SHIREN_ODDS.map((o) => [o.hit, 1 / o.oneIn]));
    const paires: Array<[string, string]> = [['RA', 'RA'], ['SPV', 'SP'], ['SHINOBIV', 'SHINOBI'], ['L', 'L']];
    for (const [kind, hit] of paires) {
      const ecart = Math.abs((t[kind as keyof typeof t] ?? 0) - officiel.get(hit as never)!) / officiel.get(hit as never)!;
      expect(ecart, `${kind} s ecarte trop du taux officiel du set`).toBeLessThan(0.06);
    }
  });

  it('les illustrations holo occupent la meme part que sur le set 1', () => {
    for (const setId of ['SS', 'KS']) {
      expect(tauxDuBoosterVariante(setId).HOLO_C).toBeCloseTo(PART_HOLO_C, 6);
      expect(tauxDuBoosterVariante(setId).HOLO_UC).toBeCloseTo(PART_HOLO_UC, 6);
    }
  });

  it('les raretes speciales du set 2 ont enfin un vivier', () => {
    const pools = eligibleVariantsForSetByRarity('SS');
    for (const r of ['SPV', 'SHINOBIV', 'POPV'] as const) {
      expect(pools[r].length, `${r} doit avoir des cartes tirables`).toBeGreaterThan(0);
    }
  });
});

describe('une impression peut etre plus rare qu une autre de meme rarete', () => {
  it('le NEJI tamponne pese moins que l autre NEJI special', () => {
    expect(poidsDeLaCarte('SS-112_2-SPV')).toBeLessThan(poidsDeLaCarte('SS-112-SPV'));
  });

  it('sur un grand nombre de boosters, il sort environ deux fois moins', () => {
    const rng = mulberry32(20260827);
    const compte = new Map<string, number>();
    for (let i = 0; i < 40000; i += 1) {
      for (const c of rollVariantBooster('SS', { rng })) {
        compte.set(c.cardId, (compte.get(c.cardId) ?? 0) + 1);
      }
    }
    const promo = compte.get('SS-112_2-SPV') ?? 0;
    const autre = compte.get('SS-112-SPV') ?? 0;
    expect(promo, 'il reste obtenable').toBeGreaterThan(0);
    const rapport = promo / autre;
    expect(rapport, 'il sort nettement moins souvent que l autre NEJI special').toBeLessThan(0.7);
    expect(rapport, 'sans devenir introuvable pour autant').toBeGreaterThan(0.2);
  });

  it('rien de reserve ne sort d un booster', () => {
    const rng = mulberry32(7);
    const vus = new Set<string>();
    const raretes = new Set<string>();
    for (let i = 0; i < 6000; i += 1) {
      for (const c of rollVariantBooster('SS', { rng })) {
        vus.add(c.cardId);
        raretes.add(String(c.rarity));
      }
    }
    expect([...raretes], 'aucun chibi ne sort d un booster').not.toContain('CHIBIV');
    const reservees = ['SS-149-L', 'SS-121-MV', 'SS-127_2-MV'].filter((id) => vus.has(id));
    expect(reservees, 'ces cartes se gagnent autrement').toEqual([]);
    expect(vus.size, 'le tirage a bien couvert du monde').toBeGreaterThan(20);
  });
});
