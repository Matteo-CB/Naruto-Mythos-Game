import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  LIGUES,
  LIGUES_KONOHA_SHIDO,
  echelleDeLaSaison,
  rangDeLigue,
  ligueDe,
  niveauDe,
  niveauRomain,
  seuilDEntree,
  tousLesRangs,
  aDesDivisions,
} from '@/lib/leagues/paliers';
import { LEAGUE_TIERS, getPlayerLeague, VALID_LEAGUE_KEYS } from '@/lib/tournament/leagueUtils';
import { RANK_TIERS, getRankTier, getRankDivision } from '@/components/EloBadge';
import {
  eloApresReset,
  perteDuReset,
  PLAFOND_DE_DEBUT_DE_SAISON,
  PLANCHER_ELO,
} from '@/lib/elo/resetDeSaison';
import { classementDeSaison } from '@/lib/badges/classementDeSaison';
import { ELO_ROLES, CLE_DE_LIGUE, getRoleForElo } from '@/lib/discord/roles';

const RACINE = process.cwd();
const LOCALES = ['en', 'fr', 'es', 'pt', 'it', 'pl', 'ja'];

describe('l echelle des ligues monte en trois niveaux par ligue', () => {
  it('neuf ligues, trois niveaux chacune, vingt-sept echelons', () => {
    expect(LIGUES).toHaveLength(9);
    for (const ligue of LIGUES) expect(ligue.seuils, ligue.key).toHaveLength(3);
    expect(tousLesRangs()).toHaveLength(27);
  });

  it('les seuils montent toujours, sans doublon ni retour en arriere', () => {
    const seuils = tousLesRangs().map((r) => r.seuil);
    for (let i = 1; i < seuils.length; i++) {
      expect(seuils[i], `echelon ${i}`).toBeGreaterThan(seuils[i - 1]);
    }
    expect(new Set(seuils).size).toBe(seuils.length);
  });

  it('l echelle va bien au-dela de 2500, ce qui etait la limite d avant', () => {
    const dernier = tousLesRangs().at(-1)!;
    expect(dernier.key).toBe('willOfFire');
    expect(dernier.seuil).toBeGreaterThan(2500);
    expect(seuilDEntree('willOfFire')).toBeGreaterThan(2500);
  });

  it('chaque elo tombe dans la bonne ligue et le bon niveau', () => {
    expect(rangDeLigue(500)).toMatchObject({ key: 'genin', niveau: 1 });
    expect(rangDeLigue(699)).toMatchObject({ key: 'genin', niveau: 2 });
    expect(rangDeLigue(700)).toMatchObject({ key: 'genin', niveau: 3 });
    expect(rangDeLigue(850)).toMatchObject({ key: 'chunin', niveau: 1 });
    expect(rangDeLigue(5700)).toMatchObject({ key: 'willOfFire', niveau: 3 });
    expect(rangDeLigue(99999)).toMatchObject({ key: 'willOfFire', niveau: 3 });
    expect(rangDeLigue(0)).toMatchObject({ key: 'academyStudent', niveau: 1 });
  });

  it('les chiffres romains vont de I a III et ne debordent jamais', () => {
    expect(niveauRomain(1)).toBe('I');
    expect(niveauRomain(2)).toBe('II');
    expect(niveauRomain(3)).toBe('III');
    expect(niveauRomain(0)).toBe('I');
    expect(niveauRomain(9)).toBe('III');
  });
});

describe('les deux tables de ligues ne peuvent plus diverger', () => {
  it('les tiers d affichage et les tiers de tournoi lisent la meme source', () => {
    expect(RANK_TIERS.map((t) => t.key)).toEqual(LIGUES.map((l) => l.key));
    expect(LEAGUE_TIERS.map((t) => t.key)).toEqual(LIGUES.map((l) => l.key));
    for (const tier of RANK_TIERS) {
      expect(tier.minElo, tier.key).toBe(seuilDEntree(tier.key));
    }
    for (const tier of LEAGUE_TIERS) {
      expect(tier.minElo, tier.key).toBe(seuilDEntree(tier.key));
    }
  });

  it('la ligue affichee et la ligue de tournoi sont toujours la meme', () => {
    for (let elo = 0; elo <= 6200; elo += 37) {
      expect(getPlayerLeague(elo), `elo ${elo}`).toBe(getRankTier(elo).key);
      expect(getPlayerLeague(elo)).toBe(ligueDe(elo));
      expect(getRankDivision(elo)).toBe(niveauDe(elo));
    }
  });

  it('le role Discord suit exactement la ligue affichee sur le site', () => {
    for (let elo = 0; elo <= 6200; elo += 41) {
      const surLeSite = ligueDe(elo);
      const surDiscord = CLE_DE_LIGUE[getRoleForElo(elo).key];
      expect(surDiscord, `elo ${elo}`).toBe(surLeSite);
    }
  });

  it('la table Discord lit les memes seuils, jamais les siens', () => {
    const source = readFileSync(join(RACINE, 'lib/discord/roles.ts'), 'utf8');
    expect(source, 'aucun seuil ecrit en dur').not.toMatch(/minElo: \d{3,}/);
    for (const role of ELO_ROLES) {
      expect(role.minElo, role.key).toBe(seuilDEntree(CLE_DE_LIGUE[role.key]));
    }
  });

  it('les cles de ligue restent celles connues des tournois', () => {
    expect(VALID_LEAGUE_KEYS).toEqual([
      'academyStudent', 'genin', 'chunin', 'specialJonin', 'eliteJonin',
      'legendarySannin', 'kage', 'sageOfSixPaths', 'willOfFire',
    ]);
  });
});

describe('la remise a niveau de fin de saison est juste', () => {
  it('personne ne depasse le plafond de debut de saison', () => {
    for (let elo = 0; elo <= 20000; elo += 13) {
      expect(eloApresReset(elo), `elo ${elo}`).toBeLessThanOrEqual(PLAFOND_DE_DEBUT_DE_SAISON);
    }
  });

  it('personne ne gagne d elo et personne ne passe sous le plancher', () => {
    for (let elo = 0; elo <= 8000; elo += 7) {
      const apres = eloApresReset(elo);
      expect(apres, `elo ${elo}`).toBeLessThanOrEqual(Math.max(elo, PLANCHER_ELO));
      expect(apres).toBeGreaterThanOrEqual(PLANCHER_ELO);
    }
  });

  it('l ordre du classement est integralement conserve', () => {
    let precedent = -1;
    for (let elo = 0; elo <= 8000; elo += 1) {
      const apres = eloApresReset(elo);
      expect(apres, `elo ${elo} casse l ordre`).toBeGreaterThanOrEqual(precedent);
      precedent = apres;
    }
  });

  it('la moitie basse du classement ne perd rien', () => {
    for (const elo of [100, 306, 450, 500, 650, 799, 800]) {
      expect(perteDuReset(elo), `elo ${elo}`).toBe(0);
    }
    expect(perteDuReset(850), 'au-dessus de la premiere tranche, la compression commence').toBeGreaterThan(0);
  });

  it('le bareme donne exactement les valeurs annoncees', () => {
    expect(eloApresReset(811)).toBe(806);
    expect(eloApresReset(1000)).toBe(910);
    expect(eloApresReset(1288)).toBe(1068);
    expect(eloApresReset(1500)).toBe(1165);
    expect(eloApresReset(2500)).toBe(1470);
    expect(eloApresReset(3185)).toBe(1607);
    expect(eloApresReset(5902)).toBe(1910);
  });

  it('un elo absurde ou negatif ne casse rien', () => {
    expect(eloApresReset(-500)).toBe(PLANCHER_ELO);
    expect(eloApresReset(Number.NaN)).toBe(PLANCHER_ELO);
  });

  it('apres la remise a niveau, le haut de l echelle reste a conquerir', () => {
    const meilleur = eloApresReset(5902);
    expect(meilleur).toBeLessThan(seuilDEntree('legendarySannin'));
    expect(ligueDe(meilleur)).toBe('eliteJonin');
  });
});

describe('chaque saison garde l echelle qui etait en vigueur pendant qu on la jouait', () => {
  it('Konoha Shido garde ses anciens seuils, sans niveaux', () => {
    expect(echelleDeLaSaison('KS')).toBe(LIGUES_KONOHA_SHIDO);
    expect(aDesDivisions(LIGUES_KONOHA_SHIDO)).toBe(false);
    expect(aDesDivisions(LIGUES)).toBe(true);
    expect(seuilDEntree('kage', LIGUES_KONOHA_SHIDO)).toBe(1700);
  });

  it('une saison inconnue prend l echelle courante', () => {
    expect(echelleDeLaSaison('ZZ')).toBe(LIGUES);
  });

  it('l archive ne retrograde personne en changeant l echelle', () => {
    const joueur = {
      id: 'x', username: 'joueur', elo: 811, wins: 5, losses: 0, draws: 0, countryCode: null,
    };
    const archive = classementDeSaison([joueur], 5, echelleDeLaSaison('KS'));
    expect(archive[0].league, 'la ligue tenue pendant la saison').toBe('specialJonin');
    expect(archive[0].leagueLevel, 'l ancienne echelle n avait pas de niveaux').toBeNull();

    const nouvelle = classementDeSaison([joueur], 5, LIGUES);
    expect(nouvelle[0].league).toBe('genin');
    expect(nouvelle[0].leagueLevel).toBe(3);
  });
});

describe('la fonctionnalite est branchee de bout en bout', () => {
  it('le niveau s affiche a cote du nom de la ligue', () => {
    const badge = readFileSync(join(RACINE, 'components/EloBadge.tsx'), 'utf8');
    expect(badge).toContain("t('rankDivision'");
    expect(badge).toContain('rankDivisionLabel');
    const profil = readFileSync(join(RACINE, 'app/[locale]/profile/[username]/page.tsx'), 'utf8');
    expect(profil).toContain("t('rankDivision'");
  });

  it('les sept langues savent ecrire le nom du palier', () => {
    for (const code of LOCALES) {
      const messages = JSON.parse(readFileSync(join(RACINE, `messages/${code}.json`), 'utf8'));
      const modele = messages.profile?.rankDivision;
      expect(modele, `messages/${code}.json`).toBeTruthy();
      expect(modele).toContain('{name}');
      expect(modele).toContain('{level}');
    }
  });

  it('le reset refuse de tourner tant que la saison n est pas archivee', () => {
    const script = readFileSync(join(RACINE, 'scripts/reset-season-elo.ts'), 'utf8');
    expect(script).toContain('prisma.seasonRanking.count');
    expect(script).toContain('--apply');
    const avantGarde = script.indexOf('archivees === 0');
    const avantEcriture = script.indexOf('prisma.user.update');
    expect(avantGarde).toBeGreaterThan(-1);
    expect(avantGarde, 'la garde passe avant toute ecriture').toBeLessThan(avantEcriture);
  });

  it('le reset ne touche jamais a l elo Evolving', () => {
    const script = readFileSync(join(RACINE, 'scripts/reset-season-elo.ts'), 'utf8');
    expect(script).not.toContain('evolvingElo');
    expect(script).toContain('data: { elo: c.nouveau }');
  });
});
