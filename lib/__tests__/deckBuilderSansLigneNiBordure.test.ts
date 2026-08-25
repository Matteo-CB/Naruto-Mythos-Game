import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RACINE = join(__dirname, '..', '..');
const DECK_BUILDER = join(RACINE, 'app', '[locale]', 'deck-builder', 'page.tsx');

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
