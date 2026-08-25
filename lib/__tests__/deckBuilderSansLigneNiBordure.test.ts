import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RACINE = join(__dirname, '..', '..');
const DECK_BUILDER = join(RACINE, 'app', '[locale]', 'deck-builder', 'page.tsx');

describe('aucun filet court ne flotte au milieu du vide, nulle part', () => {
  function fichiers(dossier: string): string[] {
    const complet = join(RACINE, dossier);
    let entrees: string[] = [];
    try { entrees = readdirSync(complet); } catch { return []; }
    const trouves: string[] = [];
    for (const e of entrees) {
      if (e === 'node_modules' || e === '.next') continue;
      const chemin = join(complet, e);
      if (statSync(chemin).isDirectory()) trouves.push(...fichiers(join(dossier, e)));
      else if (e.endsWith('.tsx')) trouves.push(join(dossier, e));
    }
    return trouves;
  }

  const LARGEUR_FIXE = /\bw-(\d+|\[[^\]]+\])/;
  const HAUTEUR_FILET = /\bh-px\b|h-\[1px\]/;

  it('un filet doit occuper toute sa ligne, ou ne pas exister', () => {
    const fautifs: string[] = [];
    for (const fichier of [...fichiers('app'), ...fichiers('components')]) {
      const lignes = readFileSync(join(RACINE, fichier), 'utf8').split('\n');
      lignes.forEach((ligne, i) => {
        if (!HAUTEUR_FILET.test(ligne)) return;
        if (!LARGEUR_FIXE.test(ligne)) return;
        if (/w-full/.test(ligne) || /flex-1/.test(ligne)) return;
        fautifs.push(`${fichier}:${i + 1}: ${ligne.trim().slice(0, 90)}`);
      });
    }
    expect(
      fautifs,
      'un trait de largeur fixe pose sous un titre centre ne separe rien: il flotte au milieu '
      + 'du vide. Soit le filet remplit sa ligne (w-full, flex-1) et separe vraiment deux blocs, '
      + 'soit il n existe pas',
    ).toEqual([]);
  });

  it('la garde balaie bien les deux dossiers', () => {
    expect(fichiers('app').length, 'des pages sont analysees').toBeGreaterThan(50);
    expect(fichiers('components').length, 'des composants sont analyses').toBeGreaterThan(50);
  });
});

describe('les ecrans qui demandent une connexion restent nus', () => {
  const ecrans = [
    join('app', '[locale]', 'deck-builder', 'page.tsx'),
    join('app', '[locale]', 'play', 'online', 'page.tsx'),
    join('app', '[locale]', 'deck-builder', 'manage', 'page.tsx'),
    join('components', 'social', 'FriendsSection.tsx'),
  ];

  for (const ecran of ecrans) {
    it(`${ecran} n ajoute aucun trait sous son titre`, () => {
      const source = readFileSync(join(RACINE, ecran), 'utf8');
      const at = source.indexOf('signInRequired');
      expect(at, 'l ecran demande bien une connexion').toBeGreaterThan(-1);
      const bloc = source.slice(Math.max(0, at - 900), at + 400);
      expect(bloc, 'le message et le bouton suffisent').not.toMatch(/h-px|h-\[1px\]/);
    });
  }
});

describe('le deck builder ne porte plus de trait flottant', () => {
  const source = readFileSync(DECK_BUILDER, 'utf8');

  it('aucun separateur centre ne coupe la page', () => {
    expect(
      source,
      'SectionDivider dessine un trait de largeur fixe, centre: dans une colonne large il '
      + 'flotte au milieu du vide au lieu de separer quoi que ce soit',
    ).not.toContain('SectionDivider');
  });

  it('aucune bordure gauche, ni structurelle ni decorative', () => {
    const lignes = source.split('\n')
      .map((l, i) => ({ n: i + 1, l }))
      .filter(({ l }) => /borderLeft\s*:/.test(l));
    expect(
      lignes.map(({ n, l }) => `${n}: ${l.trim().slice(0, 80)}`),
      'la delimitation passe par le contraste de fond et une ombre, jamais par un bord lateral',
    ).toEqual([]);
  });

  it('le panneau de droite se detache par son ombre', () => {
    expect(source, 'une ombre remplace le trait').toContain("boxShadow: '-12px 0 32px rgba(0,0,0,0.4)'");
  });
});

describe('aucune page ne reintroduit un accent de bordure colore', () => {
  function fichiers(dossier: string): string[] {
    const complet = join(RACINE, dossier);
    let entrees: string[] = [];
    try { entrees = readdirSync(complet); } catch { return []; }
    const trouves: string[] = [];
    for (const e of entrees) {
      const chemin = join(complet, e);
      if (statSync(chemin).isDirectory()) trouves.push(...fichiers(join(dossier, e)));
      else if (e.endsWith('.tsx')) trouves.push(join(dossier, e));
    }
    return trouves;
  }

  it('le deck builder ne porte aucun bord lateral de 2 pixels ou plus', () => {
    const source = readFileSync(DECK_BUILDER, 'utf8');
    const fautifs = source.split('\n')
      .map((l, i) => ({ n: i + 1, l }))
      .filter(({ l }) => /border(Left|Right|Top)\s*:\s*[`'"]\s*[2-9]px/.test(l))
      .map(({ n, l }) => `${n}: ${l.trim().slice(0, 80)}`);
    expect(fautifs, 'un bord colore sur un seul cote est banni dans tout le produit').toEqual([]);
  });

  it('la garde couvre bien le fichier attendu', () => {
    expect(fichiers('app/[locale]/deck-builder').length, 'la page existe toujours').toBeGreaterThan(0);
  });
});

describe('l export en image reprend le fond du site', () => {
  const source = readFileSync(join(RACINE, 'lib', 'utils', 'exportDeckImage.ts'), 'utf8');

  it('il utilise le motif de fond et les volutes du bas', () => {
    expect(source, 'le meme motif que les pages').toContain("'/images/bgmenu/seigaiha.webp'");
    expect(source, 'les volutes du bas de page').toContain("'/images/footer-curls-gold.svg'");
  });

  it('il part de la couleur de fond du theme', () => {
    expect(source).toContain("const BG_DARK = '#0a0a0a'");
  });

  it('les volutes sont dessinees en bas de l image', () => {
    expect(source).toContain('canvasH - hauteur * CURLS_VISIBLE_RATIO');
  });

  it('la barre doree collee au bord gauche de l entete a disparu', () => {
    expect(
      source,
      'un aplat de 4 pixels colle au bord gauche est le meme accent que les bordures bannies',
    ).not.toContain('ctx.fillRect(PADDING, PADDING, 4, HEADER_H)');
  });

  it('le vieux fond a points et ses filigranes ne sont plus dessines', () => {
    expect(source).not.toContain("rgba(255,255,255,0.008)");
    expect(source).not.toContain("'/images/icons/uzumaki-spiral.png'");
  });
});

describe('l export en image reste sobre: rien que des cartes centrees', () => {
  const source = readFileSync(join(RACINE, 'lib', 'utils', 'exportDeckImage.ts'), 'utf8');

  it('aucun trait dans les coins', () => {
    expect(source, 'les equerres decoratives sont retirees').not.toContain('drawCornerBrackets');
  });

  it('aucun trait sous les textes', () => {
    expect(source, 'le filet sous le titre du deck a disparu').not.toContain('ctx.lineTo(PADDING + contentW - 20, sepY)');
    expect(source, 'le filet sous MISSIONS a disparu').not.toContain('ctx.lineTo(PADDING + 200, mSepY)');
  });

  it('aucun losange', () => {
    expect(source, 'le carre pivote a 45 degres est retire').not.toContain('ctx.rotate(Math.PI / 4)');
  });

  it('aucun fond ni cadre derriere le texte du haut', () => {
    expect(source, 'plus de panneau sous le titre').not.toContain('drawRoundedRect(ctx, PADDING, PADDING, contentW, HEADER_H, 4)');
    expect(source, 'la couleur de panneau ne sert plus').not.toContain('const BG_PANEL');
  });

  it('les deux titres sont centres sur la largeur de l image', () => {
    expect(source).toContain("ctx.fillText(deckName || 'Deck', centreX,");
    expect(source).toContain("ctx.fillText('MISSIONS', canvasW / 2, missionLabelY)");
  });

  it('le fond du site et ses volutes restent, eux', () => {
    expect(source).toContain("'/images/bgmenu/seigaiha.webp'");
    expect(source).toContain("'/images/footer-curls-gold.svg'");
  });
});

describe('les exports sont accessibles en haut a droite', () => {
  const page = readFileSync(DECK_BUILDER, 'utf8');

  it('les deux boutons sont dans la barre du haut, cales a droite', () => {
    const at = page.indexOf("placeholder={t(\"deckBuilder.deckName\")}");
    const barre = page.slice(at, at + 3000);
    expect(barre, 'un groupe pousse a droite').toContain('flex-shrink-0 ml-auto');
    expect(barre, 'export en image').toContain('exportDeckAsImage(deckName, deckChars, deckMissions)');
    expect(barre, 'export en PDF').toContain('exportDeckAsPdf(deckName, deckChars, deckMissions)');
  });

  it('la barre du haut sait passer a la ligne quand la largeur manque', () => {
    const at = page.indexOf("backgroundColor: 'rgba(10, 10, 10, 0.9)',\n            borderBottom");
    expect(at, 'la barre du haut existe').toBeGreaterThan(-1);
    const debut = page.lastIndexOf('<div className=', at);
    expect(
      page.slice(debut, at),
      'sans retour a la ligne, deux boutons de plus feraient deborder les petits ecrans',
    ).toContain('flex-wrap');
  });

  it('les libelles ne se coupent pas au milieu', () => {
    expect((page.match(/whitespace-nowrap/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('les deux exports sont aussi proposes dans le menu mobile', () => {
    const at = page.indexOf('setMobileMenuOpen(false)');
    const menu = page.slice(at - 500, at + 4000);
    expect(menu).toContain('exportDeckAsImage(deckName, deckChars, deckMissions)');
    expect(menu).toContain('exportDeckAsPdf(deckName, deckChars, deckMissions)');
  });

  it('les boutons sont eteints tant que le deck est vide', () => {
    const occurrences = (page.match(/disabled=\{deckChars\.length === 0\}/g) ?? []).length;
    expect(occurrences, 'bureau et mobile, image et PDF').toBeGreaterThanOrEqual(4);
  });

  it('la fenetre d export ne garde que le code a partager', () => {
    const at = page.indexOf('deckBuilder.exportTitle');
    const modale = page.slice(at, at + 1800);
    expect(modale, 'les exports ne sont plus dupliques dans la fenetre').not.toContain('exportDeckAsImage(');
    expect(modale, 'idem pour le PDF').not.toContain('exportDeckAsPdf(');
    expect(modale, 'le code reste').toContain('deckBuilder.exportCopy');
  });
});
