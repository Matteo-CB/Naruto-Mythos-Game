import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { poolDePrixTousSets, poolDePrixDeTournoi, estUnPrixDeTournoiValide } from '@/lib/tournament/prizePool';
import { getCardById } from '@/lib/data/cardIndex';
import { portraitImagePath } from '@/lib/utils/imagePath';

const RACINE = process.cwd();
const FORMULAIRE = readFileSync(join(RACINE, 'components/tournament/CreateTournamentForm.tsx'), 'utf8');
const PAGE = readFileSync(join(RACINE, 'app/[locale]/tournaments/[id]/page.tsx'), 'utf8');

function fichierDeLImage(chemin: string): string {
  const sansVersion = chemin.split('?')[0].replace(/^\//, '');
  return join(RACINE, 'public', ...sansVersion.split('/'));
}

function sourcesDe(dossiers: string[]): string[] {
  const trouves: string[] = [];
  const visite = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) { if (e !== 'node_modules' && e !== '.next') visite(p); continue; }
      if (/\.(ts|tsx)$/.test(e)) trouves.push(p);
    }
  };
  for (const d of dossiers) visite(join(RACINE, d));
  return trouves;
}

describe('la carte offerte au vainqueur s affiche, quel que soit son set', () => {
  it('le pool de prix couvre plusieurs sets, pas seulement le premier', () => {
    const pool = poolDePrixTousSets();
    expect(pool.length, 'il y a bien des cartes a offrir').toBeGreaterThan(0);
    const sets = new Set(pool.map((id) => id.split('-')[0]));
    expect(sets.has('KS'), 'le set 1 est represente').toBe(true);
    expect(sets.has('SS'), 'le set 2 doit pouvoir etre choisi').toBe(true);
  });

  it('chaque carte du pool a une image qui existe reellement sur le disque', () => {
    const manquantes: string[] = [];
    for (const id of poolDePrixTousSets()) {
      const carte = getCardById(id);
      expect(carte, `${id} doit exister dans les donnees`).toBeTruthy();
      const chemin = portraitImagePath(carte);
      if (!chemin) { manquantes.push(`${id}: aucun chemin`); continue; }
      if (!existsSync(fichierDeLImage(chemin))) manquantes.push(`${id}: ${chemin}`);
    }
    expect(manquantes, 'une carte offerte sans image s affiche vide au joueur').toEqual([]);
  });

  it('le chemin construit a la main pour le set 1 ne marchait pas pour le set 2', () => {
    const sansSet2 = poolDePrixTousSets().filter((id) => id.startsWith('SS-'));
    expect(sansSet2.length, 'il existe des prix du set 2').toBeGreaterThan(0);
    for (const id of sansSet2) {
      const ancien = `/images/cards/KS/mythos_v/${id}.webp`;
      expect(
        existsSync(fichierDeLImage(ancien)),
        `l ancien chemin code en dur ${ancien} ne pouvait pas exister`,
      ).toBe(false);
      const bon = portraitImagePath(getCardById(id));
      expect(bon, `${id} a un vrai chemin`).toBeTruthy();
      expect(existsSync(fichierDeLImage(bon!)), `${bon} existe`).toBe(true);
    }
  });

  it('le tirage automatique pioche dans le set de la saison, donc du set 2', () => {
    const saison = poolDePrixDeTournoi();
    expect(saison.length, 'le tirage a de quoi piocher').toBeGreaterThan(0);
    for (const id of saison) {
      expect(estUnPrixDeTournoiValide(id), `${id} doit etre accepte par le serveur`).toBe(true);
    }
  });

  it('aucun chemin d image de carte n est plus assemble autour d une variable', () => {
    const OUVERTURE = String.fromCharCode(36) + String.fromCharCode(123);
    const BACKTICK = String.fromCharCode(96);
    const fautifs: string[] = [];
    for (const f of sourcesDe(['components', 'app'])) {
      const contenu = readFileSync(f, 'utf8');
      contenu.split(String.fromCharCode(10)).forEach((ligne, i) => {
        if (!ligne.includes('/images/cards/')) return;
        if (!ligne.includes(BACKTICK) || !ligne.includes(OUVERTURE)) return;
        fautifs.push(`${f.replace(RACINE, '')}:${i + 1} ${ligne.trim().slice(0, 90)}`);
      });
    }
    expect(
      fautifs,
      'un set ou une rarete devine a partir d un identifiant finit toujours par tomber a cote',
    ).toEqual([]);
  });

  it('les illustrations decoratives figees restent autorisees, elles ne dependent d aucune variable', () => {
    const decor = readFileSync(join(RACINE, 'components/CardBackgroundDecor.tsx'), 'utf8');
    const constantes = decor.match(/'\/images\/cards\/[A-Z]{2}\/[^']+'/g) ?? [];
    expect(constantes.length, 'ce fichier liste bien des images fixes').toBeGreaterThan(0);
    for (const c of constantes) {
      const chemin = c.slice(1, -1);
      expect(existsSync(fichierDeLImage(chemin)), `${chemin} doit exister`).toBe(true);
    }
  });

  it('le formulaire propose le vrai pool et non une liste figee', () => {
    expect(FORMULAIRE, 'la liste vient du pool serveur').toContain('poolDePrixTousSets()');
    expect(FORMULAIRE, 'plus de liste codee en dur').not.toContain('TOURNAMENT_PRIZE_CARD_IDS');
    expect(FORMULAIRE, 'l image passe par le helper').toContain('portraitImagePath(card)');
    expect(FORMULAIRE, 'la rarete affichee suit la carte').toContain('card?.rarity');
    expect(FORMULAIRE, 'plus de mention MV figee').not.toContain('{number} MV');
  });

  it('la page du tournoi affiche l image et la rarete de la vraie carte', () => {
    expect(PAGE, 'l image passe par le helper').toContain('portraitImagePath(carte)');
    expect(PAGE, 'et retombe sur une silhouette si elle manque').toContain('CardArtFallback card={carte}');
    expect(PAGE, 'plus de rarete figee').not.toContain('Mythos V');
    expect(PAGE, 'la rarete est traduite').toContain('getRarityLabel(String(card.rarity');
  });

  it('la carte reellement configuree ce soir aurait ete invisible avant le correctif', () => {
    const id = 'SS-149-L';
    const carte = getCardById(id);
    expect(carte, 'la Legendaire du set 2 existe').toBeTruthy();
    expect(
      existsSync(fichierDeLImage(`/images/cards/KS/mythos_v/${id}.webp`)),
      'ancien chemin: introuvable',
    ).toBe(false);
    expect(existsSync(fichierDeLImage(portraitImagePath(carte)!)), 'nouveau chemin: trouve').toBe(true);
  });
});
