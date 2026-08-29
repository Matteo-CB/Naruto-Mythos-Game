import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseBadgeChoisi, formatBadgeChoisi, estUnChoixValide } from '@/lib/badges/badgeChoisi';
import { PALIERS_DE_BADGE } from '@/lib/badges/saisonBadges';

const RACINE = process.cwd();
const LOCALES = ['en', 'fr', 'es', 'pt', 'it', 'pl', 'ja'];

describe('le badge choisi est verifie avant d etre accepte', () => {
  it('un choix bien forme se relit', () => {
    for (const palier of PALIERS_DE_BADGE) {
      const valeur = formatBadgeChoisi('KS', palier.badge);
      expect(parseBadgeChoisi(valeur)).toEqual({ seasonId: 'KS', badge: palier.badge });
      expect(estUnChoixValide(valeur)).toBe(true);
    }
  });

  it('tout ce qui n est pas un badge connu est refuse', () => {
    for (const mauvais of ['', 'KS', 'KS:', ':top-1', 'KS:top-2', 'ks:top-1', 'KS:legendary', 'TROPLONG:top-1', 'KS:top-1:extra', null, undefined]) {
      expect(parseBadgeChoisi(mauvais as string), String(mauvais)).toBeNull();
    }
  });

  it('un badge de ligue ne peut pas etre choisi', () => {
    for (const ligue of ['kage', 'genin', 'willOfFire', 'sageOfSixPaths']) {
      expect(parseBadgeChoisi(`KS:${ligue}`), ligue).toBeNull();
    }
  });

  it('le serveur exige que le joueur ait vraiment gagne le badge', () => {
    const route = readFileSync(join(RACINE, 'app/api/user/preferences/route.ts'), 'utf8');
    expect(route).toContain('parseBadgeChoisi');
    expect(route).toContain('prisma.seasonRanking.findFirst');
    expect(route).toContain("error: 'Badge not earned'");
    const avantVerification = route.indexOf('prisma.seasonRanking.findFirst');
    const avantEcriture = route.indexOf('update.selectedSeasonBadge = body.selectedSeasonBadge');
    expect(avantVerification, 'la verification precede l enregistrement').toBeLessThan(avantEcriture);
  });
});

describe('le badge accompagne le drapeau partout', () => {
  it('un seul composant affiche le couple drapeau et badge', () => {
    const composant = readFileSync(join(RACINE, 'components/PlayerFlag.tsx'), 'utf8');
    expect(composant).toContain('CountryFlag');
    expect(composant).toContain('SeasonBadge');
    expect(composant).toContain('parseBadgeChoisi');
  });

  it('le classement, le profil et le plateau passent par ce composant', () => {
    for (const fichier of [
      'app/[locale]/leaderboard/page.tsx',
      'app/[locale]/profile/[username]/page.tsx',
      'components/game/PlayerStatsBar.tsx',
      'components/game/OpponentStatsBar.tsx',
    ]) {
      const source = readFileSync(join(RACINE, fichier), 'utf8');
      expect(source, fichier).toContain('PlayerFlag');
    }
  });

  it('le selecteur de pays garde un drapeau nu, il ne represente aucun joueur', () => {
    const picker = readFileSync(join(RACINE, 'components/FlagPicker.tsx'), 'utf8');
    expect(picker).toContain('CountryFlag');
    expect(picker).not.toContain('PlayerFlag');
  });

  it('les routes qui envoient un drapeau envoient aussi le badge', () => {
    for (const fichier of [
      'app/api/leaderboard/route.ts',
      'app/api/leaderboard/season/route.ts',
      'app/api/profile/[username]/route.ts',
      'app/api/users/flags/route.ts',
    ]) {
      const source = readFileSync(join(RACINE, fichier), 'utf8');
      expect(source, fichier).toContain('selectedSeasonBadge');
    }
  });

  it('le plateau recupere le badge en meme temps que le drapeau', () => {
    const hook = readFileSync(join(RACINE, 'lib/hooks/usePlayerFlags.ts'), 'utf8');
    expect(hook).toContain('usePlayerBadge');
    expect(hook).toContain('badgeCache');
    expect(hook, 'un seul appel reseau pour les deux').toContain('data.badges?.[n]');
  });
});

describe('un badge explique ce qu il est', () => {
  it('survoler ouvre une petite fenetre, cliquer ouvre la description', () => {
    const infobulle = readFileSync(join(RACINE, 'components/badges/BadgeTooltip.tsx'), 'utf8');
    expect(infobulle).toContain('onMouseEnter');
    expect(infobulle).toContain('createPortal');
    const badge = readFileSync(join(RACINE, 'components/badges/SeasonBadge.tsx'), 'utf8');
    expect(badge).toContain('BadgeTooltip');
    const ligue = readFileSync(join(RACINE, 'components/badges/LeagueBadge.tsx'), 'utf8');
    expect(ligue, 'le badge de ligue aussi').toContain('BadgeTooltip');
    const panneau = readFileSync(join(RACINE, 'components/profile/SeasonBadgesPanel.tsx'), 'utf8');
    expect(panneau).toContain('SeasonBadgeModal');
    expect(panneau).toContain('onClick={() => setOuvert(b)}');
  });

  it('la fenetre de description est au bon plan', () => {
    const modale = readFileSync(join(RACINE, 'components/badges/SeasonBadgeModal.tsx'), 'utf8');
    expect(modale).toContain('Z_APP_MODAL');
    expect(modale, 'jamais une classe Tailwind pour le plan').not.toMatch(/z-\d{3,}/);
  });

  it('chaque badge a son resume et sa description dans les sept langues', () => {
    for (const code of LOCALES) {
      const messages = JSON.parse(readFileSync(join(RACINE, `messages/${code}.json`), 'utf8'));
      const bloc = messages.seasonBadges;
      expect(bloc.close, `${code} close`).toBeTruthy();
      expect(bloc.pickerLabel, `${code} pickerLabel`).toBeTruthy();
      expect(bloc.pickerHint, `${code} pickerHint`).toBeTruthy();
      expect(bloc.pickerNone, `${code} pickerNone`).toBeTruthy();
      expect(bloc.pickerEmpty, `${code} pickerEmpty`).toBeTruthy();
      for (const palier of PALIERS_DE_BADGE) {
        const resume = bloc.explication?.[palier.badge];
        const description = bloc.description?.[palier.badge];
        expect(resume, `${code} explication ${palier.badge}`).toBeTruthy();
        expect(description, `${code} description ${palier.badge}`).toBeTruthy();
        expect(resume, `${code} garde le nom de saison`).toContain('{season}');
        expect(description, `${code} garde le nom de saison`).toContain('{season}');
      }
      expect(messages.profile.leagueTooltip, `${code} leagueTooltip`).toContain('{name}');
    }
  });
});
