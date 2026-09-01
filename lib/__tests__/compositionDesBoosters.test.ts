import { describe, it, expect } from 'vitest';
import { generateBooster, generateSealedPool } from '@/lib/sealed/boosterGenerator';
import {
  KONOHA_SHIDO_ODDS,
  KONOHA_SHIDO_PACK_SIZE,
  KONOHA_SHIDO_COMMONS_PER_PACK,
  KONOHA_SHIDO_UNCOMMONS_PER_PACK,
  rollKonohaShidoChase,
  remplacementDeLHolo,
} from '@/lib/sealed/konohaShidoRates';
import { SHINOBI_SHIREN_ODDS, rollShinobiShirenChase } from '@/lib/sealed/shinobiShirenRates';

const CHASSE_KS = ['S', 'L', 'SV'];
const CHASSE_SS = ['RA', 'S', 'SP', 'SHINOBI', 'L', 'SV', 'POP'];

function compte(cartes: Array<{ rarity: string; card_type: string }>) {
  const parRarete: Record<string, number> = {};
  for (const c of cartes) parRarete[c.rarity] = (parRarete[c.rarity] ?? 0) + 1;
  return parRarete;
}

describe('un booster de Konoha Shido suit la repartition imprimee sur la notice', () => {
  it('dix cartes, dont une mission et une rare, a chaque ouverture', () => {
    for (let i = 0; i < 300; i++) {
      const pack = generateBooster(i, 'KS');
      expect(pack.cards.length, 'dix cartes par pochette').toBe(KONOHA_SHIDO_PACK_SIZE);
      expect(pack.cards.filter((c) => c.card_type === 'mission').length, 'une mission').toBe(1);
      const rares = compte(pack.cards)['R'] ?? 0;
      expect(rares, 'au moins la rare garantie').toBeGreaterThanOrEqual(1);
    }
  });

  it('quatre communes et trois peu communes garanties, la dixieme carte etant la case chasse', () => {
    for (let i = 0; i < 300; i++) {
      const pack = generateBooster(i, 'KS');
      const r = compte(pack.cards);
      const chasse = pack.cards.filter((c) => CHASSE_KS.includes(c.rarity)).length;
      const communes = r['C'] ?? 0;
      const peuCommunes = r['UC'] ?? 0;

      expect(communes, 'jamais moins de quatre communes').toBeGreaterThanOrEqual(KONOHA_SHIDO_COMMONS_PER_PACK);
      expect(peuCommunes, 'jamais moins de trois peu communes').toBeGreaterThanOrEqual(KONOHA_SHIDO_UNCOMMONS_PER_PACK);
      expect(chasse, 'une seule case chasse').toBeLessThanOrEqual(1);
      expect(
        communes + peuCommunes + (r['R'] ?? 0) + chasse,
        'les neuf cartes de personnage sont comptees',
      ).toBe(9);
    }
  });

  it('aucune carte brillante ne sort en scelle, la case est remplacee par une commune ou une peu commune', () => {
    const pool = generateSealedPool(60, 'KS');
    expect(pool.allCards.some((c) => c.isHolo), 'le scelle ne donne jamais de brillante').toBe(false);
    for (const carte of pool.allCards) {
      expect(['C', 'UC', 'R', 'S', 'L', 'SV', 'MMS'], `rarete inattendue ${carte.rarity}`).toContain(carte.rarity);
    }
  });

  it('la rare art ne sort pas des pochettes du premier set', () => {
    const pool = generateSealedPool(80, 'KS');
    expect(
      pool.allCards.filter((c) => c.rarity === 'RA').length,
      'la notice ne montre aucune rare art dans la pochette',
    ).toBe(0);
  });

  it('les taux de la case chasse sont ceux de la notice', () => {
    const attendus: Record<string, number> = { S: 10, L: 800, SV: 4000 };
    for (const { hit, oneIn } of KONOHA_SHIDO_ODDS) {
      expect(oneIn, `${hit} doit sortir une fois sur ${attendus[hit]}`).toBe(attendus[hit]);
    }
  });

  it('le tirage respecte les seuils annonces', () => {
    expect(rollKonohaShidoChase(() => 0), 'le tout premier seuil est la carte la plus rare').toBe('SV');
    expect(rollKonohaShidoChase(() => 0.05), 'un dixieme couvre la secrete').toBe('S');
    expect(rollKonohaShidoChase(() => 0.5), 'au dela, la case est ordinaire').toBeNull();
  });

  it('le remplacement de la brillante suit le meme rapport que la pochette', () => {
    expect(remplacementDeLHolo(() => 0.1)).toBe('C');
    expect(remplacementDeLHolo(() => 0.9)).toBe('UC');
  });
});

describe('un booster de Shinobi Shiren garde sa propre table', () => {
  it('les taux publies par l editeur sont intacts', () => {
    const attendus: Record<string, number> = { RA: 7, S: 10, SP: 47, SHINOBI: 701, L: 2350, NUMBERED: 2950 };
    for (const { hit, oneIn } of SHINOBI_SHIREN_ODDS) {
      expect(oneIn, `${hit} une fois sur ${attendus[hit]}`).toBe(attendus[hit]);
    }
    expect(rollShinobiShirenChase(() => 0)).toBe('NUMBERED');
    expect(rollShinobiShirenChase(() => 0.9)).toBeNull();
  });

  it('dix cartes, une mission, une rare, et jamais de brillante', () => {
    const packs = Array.from({ length: 40 }, (_, i) => generateBooster(i, 'SS'));
    for (const pack of packs) {
      expect(pack.cards.length).toBe(KONOHA_SHIDO_PACK_SIZE);
      expect(pack.cards.filter((c) => c.card_type === 'mission').length).toBe(1);
      const r = compte(pack.cards);
      expect((r['C'] ?? 0), 'quatre communes garanties').toBeGreaterThanOrEqual(KONOHA_SHIDO_COMMONS_PER_PACK);
      expect((r['UC'] ?? 0), 'trois peu communes garanties').toBeGreaterThanOrEqual(KONOHA_SHIDO_UNCOMMONS_PER_PACK);
      expect((r['R'] ?? 0), 'la rare garantie').toBeGreaterThanOrEqual(1);
    }
    expect(packs.some((p) => p.cards.some((c) => c.isHolo))).toBe(false);
  });

  it('une case chasse vide retombe sur une carte ordinaire, jamais sur du vide', () => {
    const packs = Array.from({ length: 40 }, (_, i) => generateBooster(i, 'SS'));
    for (const pack of packs) {
      const chasse = pack.cards.filter((c) => CHASSE_SS.includes(c.rarity)).length;
      const jouables = pack.cards.filter((c) => c.card_type !== 'mission').length;
      expect(jouables, 'neuf cartes de deck quoi qu il arrive, equipements compris').toBe(9);
      expect(chasse, 'au plus une carte de chasse').toBeLessThanOrEqual(1);
    }
  });
});

describe('les deux sets ne partagent jamais leur table de taux', () => {
  it('la table du premier set ne contient aucune rarete du second', () => {
    const rareteKs = KONOHA_SHIDO_ODDS.map((o) => o.hit);
    expect(rareteKs).not.toContain('SP');
    expect(rareteKs).not.toContain('SHINOBI');
    expect(rareteKs).not.toContain('RA');
  });

  it('la table du second set garde ses six raretes', () => {
    expect(SHINOBI_SHIREN_ODDS.length).toBe(6);
  });
});
