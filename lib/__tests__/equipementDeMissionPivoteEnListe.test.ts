import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getAllCards } from '@/lib/data/cardIndex';
import { portraitImagePath, normalizeImagePath } from '@/lib/utils/imagePath';
import { isLandscapeCard } from '@/lib/cards/orientation';

const RACINE = join(__dirname, '..', '..');

interface CarteCatalogue {
  id: string;
  card_type?: string;
  attach_to?: string | null;
  image_file?: string;
}

const CARTES = getAllCards() as unknown as CarteCatalogue[];
const EQUIPEMENTS_DE_MISSION = CARTES.filter(
  (c) => c.card_type === 'attachment' && c.attach_to === 'mission',
);

describe('un equipement de mission a bien une version pivotee a afficher', () => {
  it('le catalogue en contient, sinon cette garde ne verifie rien', () => {
    expect(EQUIPEMENTS_DE_MISSION.length).toBeGreaterThan(0);
  });

  it('chacun est reconnu comme une carte couchee', () => {
    for (const carte of EQUIPEMENTS_DE_MISSION) {
      const orientable = carte as Parameters<typeof isLandscapeCard>[0];
      expect(isLandscapeCard(orientable), `${carte.id} doit etre couche`).toBe(true);
    }
  });

  it('chacun pointe vers un fichier pivote different de son illustration', () => {
    for (const carte of EQUIPEMENTS_DE_MISSION) {
      const pivote = portraitImagePath(carte);
      const brut = normalizeImagePath(carte.image_file);
      expect(pivote, `${carte.id} sans image pivotee`).toBeTruthy();
      expect(pivote, `${carte.id} doit avoir sa propre image pivotee`).not.toBe(brut);
      expect(pivote).toContain('-rot.webp');
    }
  });

  it('le fichier pivote existe vraiment sur le disque', () => {
    const manquants: string[] = [];
    for (const carte of EQUIPEMENTS_DE_MISSION) {
      const chemin = portraitImagePath(carte)!.replace(/^\//, '').split('?')[0];
      if (!existsSync(join(RACINE, 'public', chemin))) manquants.push(`${carte.id}: ${chemin}`);
    }
    expect(
      manquants,
      'sans le fichier, la carte apparait vide dans la liste du deck au lieu de pivoter',
    ).toEqual([]);
  });

  it('un personnage garde son illustration normale', () => {
    const perso = CARTES.find((c) => c.card_type === 'character' && c.image_file)!;
    expect(portraitImagePath(perso)).toBe(normalizeImagePath(perso.image_file));
  });

  it('une mission garde elle aussi une version pivotee, elle est couchee', () => {
    const mission = CARTES.find((c) => c.card_type === 'mission' && c.image_file)!;
    expect(portraitImagePath(mission)).toContain('-rot.webp');
  });
});

describe('les listes qui affichent une carte debout demandent l illustration pivotee', () => {
  const emplacements: Array<[string, string, string]> = [
    [
      'la liste du deck dans le constructeur',
      join('app', '[locale]', 'deck-builder', 'page.tsx'),
      'const DeckCard = memo(function DeckCard(',
    ],
    [
      'le catalogue du scelle',
      join('components', 'sealed', 'SealedDeckBuilder.tsx'),
      'const canAdd = canAddChar(card);',
    ],
  ];

  for (const [nom, fichier, ancre] of emplacements) {
    it(`${nom} passe par portraitImagePath`, () => {
      const source = readFileSync(join(RACINE, fichier), 'utf8');
      const at = source.indexOf(ancre);
      expect(at, `ancre introuvable dans ${fichier}`).toBeGreaterThan(-1);
      const bloc = source.slice(at, at + 400);
      expect(
        bloc,
        'une case debout qui recoit une illustration couchee la rogne au lieu de la pivoter',
      ).toContain('portraitImagePath(card)');
      expect(bloc).not.toContain('normalizeImagePath(card.image_file)');
    });
  }

  it('les cases couchees gardent bien l illustration normale', () => {
    const source = readFileSync(join(RACINE, 'app', '[locale]', 'deck-builder', 'page.tsx'), 'utf8');
    const at = source.indexOf('const CatalogMission = memo(');
    expect(at).toBeGreaterThan(-1);
    expect(
      source.slice(at, at + 700),
      'une mission occupe deja une case couchee, la pivoter la mettrait de travers',
    ).toContain('normalizeImagePath(card.image_file)');
  });
});
