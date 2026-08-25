import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  construirePdf,
  dessinerEnRemplissant,
  boiteOpaque,
  CARTE_L_MM,
  CARTE_H_MM,
  A4_L_MM,
  A4_H_MM,
  COLONNES,
  RANGEES,
} from '@/lib/utils/exportDeckPdf';
import { isLandscapeCard } from '@/lib/cards/orientation';
import { getAllCards } from '@/lib/data/cardIndex';

const RACINE = join(__dirname, '..', '..');

function faussePage(taille = 64) {
  return { octets: new Uint8Array(taille).fill(0xff), largeur: 2480, hauteur: 3508 };
}

async function texteDu(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  return new TextDecoder('latin1').decode(buffer);
}

describe('la mise en page tient dans une feuille A4', () => {
  it('neuf cartes par page, en trois colonnes et trois rangees', () => {
    expect(COLONNES * RANGEES, 'neuf cartes par feuille').toBe(9);
  });

  it('les cartes sont a la taille reelle d une carte a jouer', () => {
    expect(CARTE_L_MM, 'largeur standard d une carte').toBe(63);
    expect(CARTE_H_MM, 'hauteur standard d une carte').toBe(88);
  });

  it('la grille rentre dans la feuille avec des marges egales', () => {
    const grilleL = COLONNES * CARTE_L_MM;
    const grilleH = RANGEES * CARTE_H_MM;
    expect(grilleL, 'trois cartes de large').toBe(189);
    expect(grilleH, 'trois cartes de haut').toBe(264);
    expect(grilleL).toBeLessThan(A4_L_MM);
    expect(grilleH).toBeLessThan(A4_H_MM);
    expect((A4_L_MM - grilleL) / 2, 'marge laterale').toBeCloseTo(10.5, 5);
    expect((A4_H_MM - grilleH) / 2, 'marge haute et basse').toBeCloseTo(16.5, 5);
  });

  it('les cartes se touchent, une seule coupe separe deux voisines', () => {
    const source = readFileSync(join(RACINE, 'lib/utils/exportDeckPdf.ts'), 'utf8');
    expect(source, 'aucun ecart entre les cartes').not.toMatch(/const\s+(GAP|ECART|MARGE_CARTE)\s*=/);
    expect(source, 'la position ne depend que de la taille de la carte')
      .toContain('const x = origineX + col * carteL;');
    expect(source).toContain('const y = origineY + rang * carteH;');
  });
});

describe('le fichier produit est un vrai PDF', () => {
  it('il commence par une entete PDF et se termine par la marque de fin', async () => {
    const texte = await texteDu(construirePdf([faussePage()]));
    expect(texte.startsWith('%PDF-1.4')).toBe(true);
    expect(texte.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('il declare autant de pages que d images fournies', async () => {
    for (const nb of [1, 2, 4]) {
      const texte = await texteDu(construirePdf(Array.from({ length: nb }, () => faussePage())));
      expect(texte, `${nb} page(s)`).toContain(`/Count ${nb}`);
      expect((texte.match(/\/Type \/Page[^s]/g) ?? []).length, `${nb} objets page`).toBe(nb);
    }
  });

  it('chaque page mesure exactement une feuille A4 en points', async () => {
    const texte = await texteDu(construirePdf([faussePage()]));
    expect(texte, 'A4 vaut 595,28 sur 841,89 points').toContain('/MediaBox [0 0 595.28 841.89]');
  });

  it('les images sont embarquees en JPEG sans reencodage', async () => {
    const texte = await texteDu(construirePdf([faussePage()]));
    expect(texte).toContain('/Subtype /Image');
    expect(texte, 'le flux est un JPEG tel quel').toContain('/Filter /DCTDecode');
    expect(texte).toContain('/ColorSpace /DeviceRGB');
  });

  it('la table des references pointe sur les vraies positions des objets', async () => {
    const blob = construirePdf([faussePage(), faussePage()]);
    const texte = await texteDu(blob);
    const nbObjets = 3 + 2 * 3;
    expect(texte).toContain(`xref\n0 ${nbObjets}`);

    const debutXref = Number(/startxref\n(\d+)/.exec(texte)![1]);
    expect(texte.slice(debutXref, debutXref + 4), 'startxref tombe sur la table').toBe('xref');

    const lignes = texte.slice(debutXref).split('\n');
    expect(lignes[2], 'la premiere entree decrit l objet libre').toContain('65535 f');
    const entrees = lignes.slice(3, 2 + nbObjets);
    expect(entrees.length, 'une entree par objet reel').toBe(nbObjets - 1);
    entrees.forEach((ligne, i) => {
      const position = Number(ligne.slice(0, 10));
      expect(
        texte.slice(position, position + String(i + 1).length + 6),
        `l objet ${i + 1} doit commencer a la position annoncee`,
      ).toBe(`${i + 1} 0 obj`);
    });
  });

  it('le flux de contenu etale l image sur toute la page', async () => {
    const texte = await texteDu(construirePdf([faussePage()]));
    expect(texte).toContain('595.28 0 0 841.89 0 0 cm');
    expect(texte).toContain('/Im0 Do');
  });
});

describe('le contour transparent des cartes est retire avant l impression', () => {
  function image(largeur: number, hauteur: number, opaque: { x0: number; y0: number; x1: number; y1: number }) {
    const data = new Uint8ClampedArray(largeur * hauteur * 4);
    for (let y = opaque.y0; y <= opaque.y1; y += 1) {
      for (let x = opaque.x0; x <= opaque.x1; x += 1) data[(y * largeur + x) * 4 + 3] = 255;
    }
    return data;
  }

  it('une carte bordee de transparence est ramenee a son dessin', () => {
    const zone = boiteOpaque(image(800, 1100, { x0: 27, y0: 28, x1: 771, y1: 1066 }), 800, 1100)!;
    expect(zone, 'exactement les marges mesurees sur les cartes du jeu')
      .toEqual({ sx: 27, sy: 28, sl: 745, sh: 1039 });
  });

  it('une carte sans transparence garde toute sa surface', () => {
    const zone = boiteOpaque(image(652, 464, { x0: 0, y0: 0, x1: 651, y1: 463 }), 652, 464)!;
    expect(zone).toEqual({ sx: 0, sy: 0, sl: 652, sh: 464 });
  });

  it('une image entierement transparente ne renvoie aucune zone', () => {
    expect(boiteOpaque(new Uint8ClampedArray(10 * 10 * 4), 10, 10)).toBeNull();
  });

  it('un pixel presque transparent ne compte pas comme du dessin', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    data[3] = 4;
    data[(2 * 4 + 2) * 4 + 3] = 255;
    expect(boiteOpaque(data, 4, 4)).toEqual({ sx: 2, sy: 2, sl: 1, sh: 1 });
  });

  it('deux cartes aux marges differentes remplissent la meme case', () => {
    const appels: Array<Record<string, number>> = [];
    const ctx = {
      drawImage: (_i: unknown, sx: number, sy: number, sl: number, sh: number,
        x: number, y: number, l: number, h: number) => { appels.push({ sx, sy, sl, sh, x, y, l, h }); },
    } as unknown as CanvasRenderingContext2D;

    dessinerEnRemplissant(ctx, { width: 800, height: 1100 } as HTMLImageElement, 0, 0, 744, 1039,
      { sx: 27, sy: 28, sl: 745, sh: 1039 });
    dessinerEnRemplissant(ctx, { width: 791, height: 1100 } as HTMLImageElement, 0, 0, 744, 1039,
      { sx: 0, sy: 0, sl: 791, sh: 1100 });

    for (const a of appels) {
      expect(a.l, 'la case fait toujours la meme largeur').toBe(744);
      expect(a.h, 'et la meme hauteur').toBe(1039);
    }
    expect(appels[0].sx, 'la marge transparente est sautee').toBeGreaterThanOrEqual(27);
    expect(
      appels[1].sx,
      'la carte sans marge part de son bord, au rognage de cadrage pres',
    ).toBeLessThan(3);
  });

  it('la zone lue reste dans les bornes de l image', () => {
    const appels: Array<Record<string, number>> = [];
    const ctx = {
      drawImage: (_i: unknown, sx: number, sy: number, sl: number, sh: number) => {
        appels.push({ sx, sy, sl, sh });
      },
    } as unknown as CanvasRenderingContext2D;
    dessinerEnRemplissant(ctx, { width: 800, height: 1100 } as HTMLImageElement, 0, 0, 744, 1039,
      { sx: 27, sy: 28, sl: 745, sh: 1039 });
    const a = appels[0];
    expect(a.sx).toBeGreaterThanOrEqual(27);
    expect(a.sx + a.sl).toBeLessThanOrEqual(27 + 745);
    expect(a.sy).toBeGreaterThanOrEqual(28);
    expect(a.sy + a.sh).toBeLessThanOrEqual(28 + 1039);
  });
});

describe('les cartes couchees sont imprimees couchees', () => {
  const source = readFileSync(join(RACINE, 'lib/utils/exportDeckPdf.ts'), 'utf8');

  it('les equipements de mission rejoignent les missions, pas la grille des personnages', () => {
    expect(source, 'une seule regle decide de l orientation dans tout le produit')
      .toContain("import { isLandscapeCard } from '@/lib/cards/orientation'");
    expect(source).toContain('const debout = characters.filter((c) => !estCouchee(c));');
    expect(source).toContain('...characters.filter(estCouchee),');
  });

  it('la grille couchee inverse bien largeur et hauteur', () => {
    expect(source).toContain('CARTE_H_MM,\n      CARTE_L_MM,');
  });

  it('un equipement de mission est bien reconnu comme couche', () => {
    const equipement = { card_type: 'attachment', attach_to: 'mission' } as const;
    const objet = { card_type: 'attachment', attach_to: 'character' } as const;
    expect(isLandscapeCard(equipement), 'EXAM STADIUM et ses semblables').toBe(true);
    expect(isLandscapeCard(objet), 'un objet porte par un personnage reste debout').toBe(false);
    expect(isLandscapeCard({ card_type: 'mission' }), 'une mission').toBe(true);
    expect(isLandscapeCard({ card_type: 'character' }), 'un personnage').toBe(false);
  });

  it('le catalogue contient bien des equipements de mission a imprimer couches', () => {
    const couches = (getAllCards() as Array<{ card_type?: string; attach_to?: string | null }>)
      .filter((c) => c.card_type === 'attachment' && c.attach_to === 'mission');
    expect(couches.length, 'sinon ce chemin ne serait jamais emprunte').toBeGreaterThan(0);
  });
});

describe('les cartes gardent leurs proportions sans etre deformees', () => {
  function faussesMesures() {
    const appels: Array<Record<string, number>> = [];
    const ctx = {
      drawImage: (_img: unknown, sx: number, sy: number, sl: number, sh: number,
        x: number, y: number, l: number, h: number) => {
        appels.push({ sx, sy, sl, sh, x, y, l, h });
      },
    } as unknown as CanvasRenderingContext2D;
    return { ctx, appels };
  }

  it('une image plus large que la case est rognee sur les cotes, jamais etiree', () => {
    const { ctx, appels } = faussesMesures();
    dessinerEnRemplissant(ctx, { width: 800, height: 1100 } as HTMLImageElement, 0, 0, 744, 1039);
    const a = appels[0];
    expect(a.l, 'la case garde la taille demandee').toBe(744);
    expect(a.h).toBe(1039);
    expect(a.sh, 'toute la hauteur de l image est utilisee').toBe(1100);
    expect(a.sl, 'un peu de largeur est rognee').toBeLessThan(800);
    expect(a.sx, 'le rognage est centre').toBeCloseTo((800 - a.sl) / 2, 5);
    expect(a.sl / a.sh, 'la portion prise a le ratio de la case').toBeCloseTo(744 / 1039, 5);
  });

  it('une image plus haute que la case est rognee en haut et en bas', () => {
    const { ctx, appels } = faussesMesures();
    dessinerEnRemplissant(ctx, { width: 800, height: 1600 } as HTMLImageElement, 0, 0, 744, 1039);
    const a = appels[0];
    expect(a.sl, 'toute la largeur est utilisee').toBe(800);
    expect(a.sh).toBeLessThan(1600);
    expect(a.sy).toBeCloseTo((1600 - a.sh) / 2, 5);
  });
});

describe('le bouton est propose avec les autres exports', () => {
  const page = readFileSync(join(RACINE, 'app', '[locale]', 'deck-builder', 'page.tsx'), 'utf8');

  it('la fenetre d export appelle bien le PDF', () => {
    expect(page).toContain('exportDeckAsPdf(deckName, deckChars, deckMissions)');
    expect(page).toContain('deckBuilder.exportAsPdf');
  });

  it('les sept langues ont le libelle et son explication', () => {
    for (const lang of ['fr', 'en', 'es', 'pt', 'it', 'pl', 'ja']) {
      const messages = JSON.parse(readFileSync(join(RACINE, 'messages', `${lang}.json`), 'utf8'));
      expect(messages.deckBuilder.exportAsPdf, `${lang}: libelle du bouton`).toBeTruthy();
      expect(messages.deckBuilder.exportPdfDesc, `${lang}: explication`).toBeTruthy();
    }
  });
});
