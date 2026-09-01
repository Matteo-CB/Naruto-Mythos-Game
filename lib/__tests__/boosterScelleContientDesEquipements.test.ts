import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { generateSealedPool } from '@/lib/sealed/boosterGenerator';
import { separateSealedPool } from '@/lib/sealed/boosterGenerator';
import { getPlayableCharacters, getPlayableAttachments } from '@/lib/data/cardLoader';
import { MIN_DECK_SIZE, MISSION_CARDS_PER_PLAYER } from '@/lib/engine/types';

const RACINE = process.cwd();
const SET = 'SS';

function comptes(setId: string) {
  const perso = getPlayableCharacters().filter((c) => c.set === setId);
  const equip = getPlayableAttachments().filter((a) => a.set === setId);
  return {
    communs: perso.filter((c) => c.rarity === 'C').length + equip.filter((a) => a.rarity === 'C').length,
    peuCommunes: perso.filter((c) => c.rarity === 'UC').length + equip.filter((a) => a.rarity === 'UC').length,
    equipements: equip.length,
  };
}

describe('un booster scelle contient des equipements, comme la vraie boite', () => {
  it('le guide officiel donne 55 Common et 55 Uncommon, equipements compris', () => {
    const c = comptes(SET);
    expect(c.equipements, 'le set 2 compte 32 equipements').toBe(32);
    expect(c.communs, '55 cartes de rarete Common').toBe(55);
    expect(c.peuCommunes, '55 cartes de rarete Uncommon').toBe(55);
  });

  it('les equipements sortent des boosters, et pas au compte-gouttes', () => {
    let equipements = 0;
    let poolsSansEquipement = 0;
    const tirages = 200;
    for (let i = 0; i < tirages; i++) {
      const pool = generateSealedPool(6, SET);
      const n = pool.allCards.filter((c) => c.card_type === 'attachment').length;
      equipements += n;
      if (n === 0) poolsSansEquipement++;
    }
    const moyenne = equipements / tirages;
    expect(moyenne, 'environ un cinquieme du pool, comme dans la boite').toBeGreaterThan(8);
    expect(moyenne).toBeLessThan(16);
    expect(poolsSansEquipement, 'trois parties de suite sans le moindre equipement etait le bug signale').toBe(0);
  });

  it('la composition reste celle du guide: 4 communes, 3 peu communes, 1 rare, 1 chasse, 1 mission', () => {
    const pool = generateSealedPool(3, SET);
    expect(pool.boosters).toHaveLength(3);
    for (const booster of pool.boosters) {
      expect(booster.cards, 'dix cartes par booster').toHaveLength(10);
      expect(booster.cards.filter((c) => c.card_type === 'mission'), 'une mission').toHaveLength(1);
      expect(booster.cards.filter((c) => c.rarity === 'R').length, 'au moins la rare garantie').toBeGreaterThanOrEqual(1);
      expect(booster.cards.some((c) => c.isHolo), 'le scelle ne rend jamais de holo').toBe(false);
    }
  });

  it('chaque taille de pool permet encore un deck legal', () => {
    for (const taille of [4, 5, 6]) {
      for (let i = 0; i < 60; i++) {
        const pool = generateSealedPool(taille, SET);
        const jouables = pool.allCards.filter((c) => c.card_type !== 'mission').length;
        const missions = pool.allCards.filter((c) => c.card_type === 'mission').length;
        expect(jouables, `${taille} boosters donnent de quoi monter un deck`).toBeGreaterThanOrEqual(MIN_DECK_SIZE);
        expect(missions, `${taille} boosters donnent assez de missions`).toBeGreaterThanOrEqual(MISSION_CARDS_PER_PLAYER);
      }
    }
  });

  it('le constructeur automatique voit aussi les equipements', () => {
    const pool = generateSealedPool(6, SET);
    const { characters, missions } = separateSealedPool(pool);
    expect(characters.some((c) => c.card_type === 'attachment'), 'ils sont jouables donc proposes').toBe(true);
    expect(missions.every((m) => m.card_type === 'mission')).toBe(true);
    expect(characters.length + missions.length).toBe(pool.allCards.length);
  });

  it('la revue du pool les montre au lieu de les cacher', () => {
    const revue = readFileSync(join(RACINE, 'components/sealed/SealedPoolReview.tsx'), 'utf8');
    expect(revue, 'filtrer sur character seul rendait les equipements invisibles')
      .not.toContain("filter((c) => c.card_type === 'character')");
  });

  it('le vivier des boosters part des personnages ET des equipements', () => {
    const source = readFileSync(join(RACINE, 'lib/sealed/boosterGenerator.ts'), 'utf8');
    const bloc = source.slice(source.indexOf('function buildRarityBuckets'), source.indexOf('function bucketsHaveEnough'));
    expect(bloc).toContain('getPlayableAttachments()');
    expect(bloc, 'les deux viviers ordinaires melangent les deux types').toContain('ordinaires.filter');
  });

  it('le set 1 n a pas d equipement, sa composition ne bouge donc pas', () => {
    expect(getPlayableAttachments().filter((a) => a.set === 'KS')).toHaveLength(0);
    const pool = generateSealedPool(4, 'KS');
    expect(pool.allCards.filter((c) => c.card_type === 'attachment')).toHaveLength(0);
    expect(pool.allCards.filter((c) => c.card_type !== 'mission').length).toBeGreaterThanOrEqual(MIN_DECK_SIZE);
  });
});
