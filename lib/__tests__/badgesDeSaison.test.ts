import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  badgePourLeRang,
  estUnBadgeConnu,
  imageDuBadge,
  trieLesBadges,
  PALIERS_DE_BADGE,
  RANG_MAXIMUM_RECOMPENSE,
  SAISON_ARCHIVEE,
} from '@/lib/badges/saisonBadges';
import {
  classementDeSaison,
  estClasse,
  PARTIES_DE_PLACEMENT,
  type JoueurClassable,
} from '@/lib/badges/classementDeSaison';

const RACINE = process.cwd();
const LOCALES = ['en', 'fr', 'es', 'pt', 'it', 'pl', 'ja'];

function joueur(nom: string, elo: number, wins = 5, losses = 0, draws = 0): JoueurClassable {
  return { id: `id-${nom}`, username: nom, elo, wins, losses, draws, countryCode: null };
}

describe('le badge suit le rang, et un seul badge par joueur', () => {
  it('chaque palier commence ou le precedent s arrete', () => {
    expect(badgePourLeRang(1)).toBe('top-1');
    expect(badgePourLeRang(2)).toBe('top-10');
    expect(badgePourLeRang(10)).toBe('top-10');
    expect(badgePourLeRang(11)).toBe('top-50');
    expect(badgePourLeRang(50)).toBe('top-50');
    expect(badgePourLeRang(51)).toBe('top-100');
    expect(badgePourLeRang(100)).toBe('top-100');
    expect(badgePourLeRang(101)).toBe('top-200');
    expect(badgePourLeRang(200)).toBe('top-200');
  });

  it('au dela du dernier palier, plus aucun badge', () => {
    expect(badgePourLeRang(RANG_MAXIMUM_RECOMPENSE + 1)).toBeNull();
    expect(badgePourLeRang(0)).toBeNull();
    expect(badgePourLeRang(-3)).toBeNull();
    expect(badgePourLeRang(Number.NaN)).toBeNull();
  });

  it('les quatre visuels existent pour la saison archivee', () => {
    for (const palier of PALIERS_DE_BADGE) {
      expect(estUnBadgeConnu(palier.badge)).toBe(true);
      const chemin = imageDuBadge(SAISON_ARCHIVEE, palier.badge).replace(/^\//, '');
      expect(existsSync(join(RACINE, 'public', chemin)), `${chemin} doit exister`).toBe(true);
    }
  });
});

describe('le classement archive est deterministe et ne recompense que les joueurs classes', () => {
  it('un joueur sous le nombre de parties de placement n est pas classe du tout', () => {
    const trop_peu = joueur('novice', 9999, 2, 1, 0);
    expect(estClasse(trop_peu)).toBe(false);
    const rangs = classementDeSaison([trop_peu, joueur('regulier', 500)]);
    expect(rangs.map((l) => l.username)).toEqual(['regulier']);
    expect(rangs[0].rank).toBe(1);
  });

  it('le classement suit l elo, puis les victoires, puis le nom', () => {
    const rangs = classementDeSaison([
      joueur('bas', 400),
      joueur('haut', 900),
      joueur('milieu_b', 600, 5),
      joueur('milieu_a', 600, 9),
    ]);
    expect(rangs.map((l) => l.username)).toEqual(['haut', 'milieu_a', 'milieu_b', 'bas']);
    expect(rangs.map((l) => l.rank)).toEqual([1, 2, 3, 4]);
  });

  it('le meme classement calcule deux fois donne exactement le meme ordre', () => {
    const joueurs = Array.from({ length: 40 }, (_, i) => joueur(`j${i}`, 500 + (i % 7) * 10));
    const a = classementDeSaison(joueurs).map((l) => `${l.rank}:${l.username}`);
    const b = classementDeSaison([...joueurs].reverse()).map((l) => `${l.rank}:${l.username}`);
    expect(a).toEqual(b);
  });

  it('seuls les deux cents premiers portent un badge', () => {
    const total = RANG_MAXIMUM_RECOMPENSE + 30;
    const joueurs = Array.from({ length: total }, (_, i) => joueur(`j${String(i).padStart(4, '0')}`, 4000 - i));
    const rangs = classementDeSaison(joueurs);
    expect(rangs).toHaveLength(total);
    expect(rangs.filter((l) => l.badge !== null)).toHaveLength(RANG_MAXIMUM_RECOMPENSE);
    expect(rangs[0].badge).toBe('top-1');
    expect(rangs[99].badge).toBe('top-100');
    expect(rangs[100].badge).toBe('top-200');
    expect(rangs[RANG_MAXIMUM_RECOMPENSE - 1].badge).toBe('top-200');
    expect(rangs[RANG_MAXIMUM_RECOMPENSE].badge).toBeNull();
    for (const ligne of rangs) {
      expect(ligne.badge === null || estUnBadgeConnu(ligne.badge)).toBe(true);
    }
  });

  it('le nombre de parties archive est bien la somme des trois issues', () => {
    const rangs = classementDeSaison([joueur('compteur', 700, 6, 3, 2)]);
    expect(rangs[0].games).toBe(11);
    expect(rangs[0].wins).toBe(6);
    expect(rangs[0].losses).toBe(3);
    expect(rangs[0].draws).toBe(2);
  });

  it('le seuil de parties est reglable sans toucher au reste', () => {
    const petit = joueur('deux_parties', 800, 1, 1, 0);
    expect(classementDeSaison([petit])).toHaveLength(0);
    expect(classementDeSaison([petit], 2)).toHaveLength(1);
    expect(PARTIES_DE_PLACEMENT).toBe(5);
  });
});

describe('la ligue de fin de saison est archivee avec le rang', () => {
  it('chaque ligne porte la ligue correspondant a son elo final', () => {
    const rangs = classementDeSaison([
      joueur('sommet', 2600),
      joueur('kage', 1800),
      joueur('debutant', 300),
    ]);
    expect(rangs.map((l) => l.league)).toEqual(['willOfFire', 'kage', 'academyStudent']);
  });

  it('la ligue archivee ne bouge plus meme si le joueur perd son elo ensuite', () => {
    const avant = classementDeSaison([joueur('joueur', 1800)])[0];
    const apres = classementDeSaison([joueur('joueur', 200)])[0];
    expect(avant.league).toBe('kage');
    expect(apres.league).toBe('academyStudent');
    expect(avant.league).not.toBe(apres.league);
  });

  it('la ligue voyage jusqu au profil et jusqu au classement archive', () => {
    const profil = readFileSync(join(RACINE, 'app/api/profile/[username]/route.ts'), 'utf8');
    expect(profil).toContain('league: true');
    const classement = readFileSync(join(RACINE, 'app/api/leaderboard/season/route.ts'), 'utf8');
    expect(classement).toContain('league: true');
    const panneau = readFileSync(join(RACINE, 'components/profile/SeasonBadgesPanel.tsx'), 'utf8');
    expect(panneau).toContain('LeagueBadge');
    const page = readFileSync(join(RACINE, 'app/[locale]/leaderboard/page.tsx'), 'utf8');
    expect(page).toContain('LeagueBadge');
  });

  it('le profil renvoie aussi les joueurs classes sans badge, pour leur ligue', () => {
    const profil = readFileSync(join(RACINE, 'app/api/profile/[username]/route.ts'), 'utf8');
    expect(profil, 'ne pas filtrer sur badge non nul').not.toContain('badge: { not: null }');
  });
});

describe('les badges se rangent du meilleur au moins bon', () => {
  it('le rang decide de l ordre affiche', () => {
    const ordonnes = trieLesBadges([
      { seasonId: 'KS', badge: 'top-50', rank: 42, elo: 700 },
      { seasonId: 'SS', badge: 'top-1', rank: 1, elo: 900 },
    ]);
    expect(ordonnes.map((b) => b.badge)).toEqual(['top-1', 'top-50']);
  });
});

describe('la fonctionnalite est branchee de bout en bout', () => {
  it('le profil renvoie les badges du joueur', () => {
    const route = readFileSync(join(RACINE, 'app/api/profile/[username]/route.ts'), 'utf8');
    expect(route).toContain('prisma.seasonRanking.findMany');
    expect(route).toContain('seasonBadges');
  });

  it('le classement archive a sa propre route, triee par rang', () => {
    const route = readFileSync(join(RACINE, 'app/api/leaderboard/season/route.ts'), 'utf8');
    expect(route).toContain('prisma.seasonRanking.findMany');
    expect(route).toContain("orderBy: { rank: 'asc' }");
  });

  it('la page classement propose la saison archivee et affiche ses lignes', () => {
    const page = readFileSync(join(RACINE, 'app/[locale]/leaderboard/page.tsx'), 'utf8');
    expect(page).toContain("handleBoardTypeChange('season')");
    expect(page).toContain('SeasonLeaderRow');
    expect(page).toContain('/api/leaderboard/season');
  });

  it('le profil affiche la section des badges', () => {
    const page = readFileSync(join(RACINE, 'app/[locale]/profile/[username]/page.tsx'), 'utf8');
    expect(page).toContain('SeasonBadgesPanel');
  });

  it('la table archivee existe dans le schema, avec une ligne par joueur et par saison', () => {
    const schema = readFileSync(join(RACINE, 'prisma/schema.prisma'), 'utf8');
    expect(schema).toContain('model SeasonRanking');
    expect(schema).toContain('@@unique([seasonId, userId])');
    expect(schema).toContain('@@index([seasonId, rank])');
  });

  it('les sept langues ont les textes des badges de saison', () => {
    for (const code of LOCALES) {
      const messages = JSON.parse(readFileSync(join(RACINE, `messages/${code}.json`), 'utf8'));
      const bloc = messages.seasonBadges;
      expect(bloc, `messages/${code}.json doit porter seasonBadges`).toBeTruthy();
      expect(bloc.title).toBeTruthy();
      expect(bloc.empty).toBeTruthy();
      expect(bloc.rank, `${code}: le rang doit garder son parametre`).toContain('{rank}');
      for (const palier of PALIERS_DE_BADGE) {
        expect(bloc.tier[palier.badge], `${code}: palier ${palier.badge}`).toBeTruthy();
      }
    }
  });
});
