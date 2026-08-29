import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  FAMILLES_DE_BADGE,
  familleDuBadge,
  tousLesBadgesExistants,
  badgesDePalierExistants,
  badgesDePalierAtteints,
  badgesDeSaisonExistants,
  badgesDeRecompenseExistants,
} from '@/lib/badges/familles';
import { imageDuBadge, estUnBadgeConnu, palierDuBadge, badgeDuPalier } from '@/lib/badges/saisonBadges';
import { parseBadgeChoisi, estUnChoixValide } from '@/lib/badges/badgeChoisi';
import { paliersIllustres } from '@/lib/battlepass/iconesDePalier';

const RACINE = process.cwd();
const LOCALES = ['en', 'fr', 'es', 'pt', 'it', 'pl', 'ja'];

describe('toutes les familles de badges sont servies, aucune ne peut etre oubliee', () => {
  it('le registre couvre exactement les familles connues', () => {
    expect([...FAMILLES_DE_BADGE].sort()).toEqual(['palier', 'recompense', 'saison']);
    const parFamille = new Map<string, number>();
    for (const b of tousLesBadgesExistants()) {
      parFamille.set(b.famille, (parFamille.get(b.famille) ?? 0) + 1);
    }
    for (const famille of FAMILLES_DE_BADGE) {
      expect(parFamille.get(famille) ?? 0, `la famille ${famille} doit fournir au moins un badge`).toBeGreaterThan(0);
    }
  });

  it('chaque badge existant est reconnu, classe, et a son visuel sur le disque', () => {
    for (const b of tousLesBadgesExistants()) {
      expect(estUnBadgeConnu(b.badge), `${b.badge} doit etre reconnu`).toBe(true);
      expect(familleDuBadge(b.badge), `${b.badge} doit avoir une famille`).toBe(b.famille);
      const chemin = imageDuBadge(b.seasonId ?? '', b.badge).replace(/^\//, '');
      expect(existsSync(join(RACINE, 'public', chemin)), `${b.badge}: ${chemin}`).toBe(true);
    }
  });

  it('chaque badge existant se choisit et se relit sans perte', () => {
    for (const b of tousLesBadgesExistants()) {
      expect(estUnChoixValide(b.valeur), b.valeur).toBe(true);
      expect(parseBadgeChoisi(b.valeur), b.valeur).toEqual({ seasonId: b.seasonId, badge: b.badge });
    }
  });

  it('un administrateur se voit proposer toutes les familles, sans exception', () => {
    const route = readFileSync(join(RACINE, 'app/api/user/badges/route.ts'), 'utf8');
    expect(route, 'badges de saison').toContain('badgesDeSaisonPourAdmin');
    expect(route, 'badges de recompense').toContain('badgesDeRecompensePourAdmin');
    expect(route, 'badges de palier').toContain('badgesDePalierExistants');
    const picker = readFileSync(join(RACINE, 'components/settings/SeasonBadgePicker.tsx'), 'utf8');
    expect(picker).toContain('seasonBadges');
    expect(picker).toContain('awardBadges');
    expect(picker).toContain('tierBadges');
  });
});

describe('les badges de palier suivent la progression du joueur', () => {
  it('les paliers illustres du battlepass sont exactement les badges de palier', () => {
    const attendus = paliersIllustres().map((t) => badgeDuPalier(t)).sort();
    expect(badgesDePalierExistants().map((b) => b.badge).sort()).toEqual(attendus);
  });

  it('un joueur ne voit que les paliers qu il a franchis', () => {
    const paliers = paliersIllustres();
    const plusBas = Math.min(...paliers);
    const plusHaut = Math.max(...paliers);
    expect(badgesDePalierAtteints(0), 'aucun palier atteint').toHaveLength(0);
    expect(badgesDePalierAtteints(plusBas - 1)).toHaveLength(0);
    expect(badgesDePalierAtteints(plusBas)).toHaveLength(1);
    expect(badgesDePalierAtteints(plusHaut)).toHaveLength(paliers.length);
    expect(badgesDePalierAtteints(9999)).toHaveLength(paliers.length);
  });

  it('le serveur verifie la progression avant d accepter le badge', () => {
    const route = readFileSync(join(RACINE, 'app/api/user/preferences/route.ts'), 'utf8');
    expect(route).toContain('palierDuBadge(choix.badge)');
    expect(route).toContain('battlepassTier');
    const avantVerification = route.indexOf('palierDuBadge(choix.badge)');
    const avantEcriture = route.indexOf('update.selectedSeasonBadge = body.selectedSeasonBadge');
    expect(avantVerification).toBeLessThan(avantEcriture);
  });

  it('le numero du palier se lit et se reecrit sans erreur', () => {
    for (const tier of paliersIllustres()) {
      expect(palierDuBadge(badgeDuPalier(tier))).toBe(tier);
    }
    expect(palierDuBadge('top-10')).toBeNull();
    expect(palierDuBadge('tournament-winner')).toBeNull();
  });

  it('le profil montre aussi les paliers gagnes', () => {
    const route = readFileSync(join(RACINE, 'app/api/profile/[username]/route.ts'), 'utf8');
    expect(route).toContain('badgesDePalierAtteints');
    const panneau = readFileSync(join(RACINE, 'components/profile/SeasonBadgesPanel.tsx'), 'utf8');
    expect(panneau).toContain('paliers');
  });
});

describe('chaque famille a ses textes dans les sept langues', () => {
  it('un libelle, un resume et une description existent pour tout badge', () => {
    for (const code of LOCALES) {
      const messages = JSON.parse(readFileSync(join(RACINE, `messages/${code}.json`), 'utf8'));
      const bloc = messages.seasonBadges;
      for (const b of badgesDeSaisonExistants()) {
        expect(bloc.tier?.[b.badge], `${code}: libelle de ${b.badge}`).toBeTruthy();
        expect(bloc.explication?.[b.badge], `${code}: resume de ${b.badge}`).toBeTruthy();
      }
      for (const b of badgesDeRecompenseExistants()) {
        expect(bloc.tier?.[b.badge], `${code}: libelle de ${b.badge}`).toBeTruthy();
        expect(bloc.explication?.[b.badge], `${code}: resume de ${b.badge}`).toBeTruthy();
      }
      expect(bloc.battlepassTier, `${code}: libelle des paliers`).toContain('{tier}');
      expect(bloc.explicationPalier, `${code}: resume des paliers`).toContain('{tier}');
      expect(bloc.descriptionPalier, `${code}: description des paliers`).toContain('{tier}');
    }
  });
});
