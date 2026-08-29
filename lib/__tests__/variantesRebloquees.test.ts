import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { FORCE_UNLOCKED_CARD_IDS } from '@/lib/variants/constants';
import { getForceUnlockedCardIds, isForceUnlockedCard } from '@/lib/variants/forceUnlock';
import { SET_REGISTRY } from '@/lib/data/sets/registry';
import { carteDeBasePour, estUneVarianteVerrouillee, idActuel, IDS_HERITES } from '@/lib/variants/carteDeBase';
import { getCardById } from '@/lib/data/cardIndex';
import { getAllCards } from '@/lib/data/cardLoader';
import { isLockedVariantCard } from '@/lib/variants/isVariant';

const RACINE = process.cwd();

describe('les variantes sont bien reverrouillees', () => {
  it('aucune carte n est deverrouillee de force', () => {
    expect(FORCE_UNLOCKED_CARD_IDS.size, 'la liste doit rester vide').toBe(0);
    expect(getForceUnlockedCardIds().size, 'aucune carte deverrouillee globalement').toBe(0);
  });

  it('aucun set n est en cours de revelation, ce qui ouvrirait tout son contenu', () => {
    for (const [id, descripteur] of Object.entries(SET_REGISTRY)) {
      expect(descripteur.status, `${id}: un set en revelation deverrouille ses variantes`).not.toBe('revealing');
    }
  });

  it('les variantes des sets publies restent verrouillees une a une', () => {
    const variantes = getAllCards().filter((c) => isLockedVariantCard(c));
    expect(variantes.length, 'le catalogue contient bien des variantes').toBeGreaterThan(50);
    for (const carte of variantes) {
      expect(isForceUnlockedCard(carte.id), `${carte.id} ne doit pas etre ouverte`).toBe(false);
    }
  });
});

describe('aucune carte de deck ne reste sans carte de base', () => {
  it('les deux identifiants herites pointent vers la carte renumerotee', () => {
    expect(idActuel('KS-000-L')).toBe('KS-133-L');
    expect(idActuel('SS-000-L')).toBe('SS-149-L');
    for (const [ancien, actuel] of Object.entries(IDS_HERITES)) {
      expect(getCardById(actuel), `${ancien} doit mener a une carte reelle`).toBeTruthy();
      expect(getCardById(ancien), `${ancien} n existe plus dans le catalogue`).toBeFalsy();
    }
  });

  it('les cartes or du set 2 retrouvent leur impression ordinaire', () => {
    expect(carteDeBasePour('SS-999-L')).toBe('SS-141-S');
    expect(carteDeBasePour('SS-998-L')).toBe('SS-144-S');
    expect(carteDeBasePour('KS-000-L')).toBe('KS-133-S');
    expect(carteDeBasePour('SS-000-L')).toBe('SS-149-S');
  });

  it('la base retenue porte bien le meme personnage et les memes valeurs', () => {
    for (const [variante, attendue] of [['SS-999-L', 'SS-141-S'], ['SS-998-L', 'SS-144-S']] as const) {
      const v = getCardById(variante)!;
      const b = getCardById(attendue)!;
      expect(b.name_fr, `${variante}: meme personnage`).toBe(v.name_fr);
      expect(b.chakra, `${variante}: meme cout`).toBe(v.chakra);
      expect(b.power, `${variante}: meme puissance`).toBe(v.power);
    }
  });

  it('toute variante verrouillee du catalogue a une carte de base reelle', () => {
    const sansBase: string[] = [];
    for (const carte of getAllCards()) {
      if (!estUneVarianteVerrouillee(carte.id)) continue;
      const base = carteDeBasePour(carte.id);
      if (base === carte.id || !getCardById(base)) sansBase.push(carte.id);
    }
    expect(sansBase, 'aucune variante ne doit rester orpheline').toEqual([]);
  });
});

describe('la migration des decks suit la regle decidee', () => {
  const script = readFileSync(join(RACINE, 'scripts/migrate-deck-variants.ts'), 'utf8');

  it('elle ne touche jamais les decks des administrateurs', () => {
    expect(script).toContain('isAdmin(');
    expect(script).toContain('administrateurs.has(deck.userId)');
  });

  it('elle garde les variantes possedees mais ramene celles du set 2', () => {
    expect(script).toContain("SETS_A_REPRENDRE = new Set(['SS'])");
    expect(script).toContain("raison: 'ramenee-set2'");
    expect(script).toContain("raison: 'possedee'");
  });

  it('elle ne retire aucune carte', () => {
    expect(script, 'chaque carte examinee est reecrite dans le deck').toContain('nouveaux.push(sort.garde)');
    expect(script).not.toContain('cartesRetirees +=');
  });

  it('elle n ecrit qu avec --apply', () => {
    const avantGarde = script.indexOf('const APPLIQUER');
    const avantEcriture = script.indexOf('prisma.deck.update');
    expect(avantGarde).toBeLessThan(avantEcriture);
    expect(script).toContain('if (APPLIQUER) {');
  });
});
