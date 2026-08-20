import { describe, it, expect } from 'vitest';
import {
  estPremierDimancheDuMois,
  pointsDe,
  bornesDuMois,
  bornesDuMoisPrecedent,
  texteCodeAcces,
  NWL_CHUNIN_START_HOUR,
  NWL_KAGE_START_HOUR,
  NWL_CHUNIN_MAX_PLAYERS,
  NWL_KAGE_MAX_PLAYERS,
  NWL_POINTS_PER_WIN,
  NWL_POINTS_PER_LOSS,
  NWL_TIER_LEAD_HOURS,
} from '@/lib/tournament/nwlTiers';
import { NWL_REG_OPEN_HOUR } from '@/lib/tournament/nwlFridayTournament';
import { NWL_START_HOUR } from '@/lib/tournament/nwlPartner';

describe('les horaires suivent les affiches', () => {
  it('le Chunin part a 21h britannique, soit 22h a Paris', () => {
    expect(NWL_CHUNIN_START_HOUR - 1, 'heure britannique').toBe(21);
  });

  it('le Kage part a 20h britannique, soit 21h a Paris', () => {
    expect(NWL_KAGE_START_HOUR - 1, 'heure britannique').toBe(20);
  });

  it('les tailles annoncees sont respectees', () => {
    expect(NWL_CHUNIN_MAX_PLAYERS, '32 joueurs le samedi').toBe(32);
    expect(NWL_KAGE_MAX_PLAYERS, 'les 8 meilleurs Chunin').toBe(8);
  });
});

describe('le bareme de points suit l affiche', () => {
  it('trois points par victoire, un par defaite', () => {
    expect(NWL_POINTS_PER_WIN).toBe(3);
    expect(NWL_POINTS_PER_LOSS).toBe(1);
    expect(pointsDe(4, 2), 'quatre victoires et deux defaites').toBe(14);
    expect(pointsDe(0, 0), 'aucun match joue').toBe(0);
  });
});

describe('le premier dimanche du mois est correctement identifie', () => {
  it('reconnait le premier dimanche', () => {
    expect(estPremierDimancheDuMois(2026, 9, 6), '6 septembre 2026 est un dimanche').toBe(true);
    expect(estPremierDimancheDuMois(2026, 11, 1), '1er novembre 2026 est un dimanche').toBe(true);
  });

  it('refuse les dimanches suivants et les autres jours', () => {
    expect(estPremierDimancheDuMois(2026, 9, 13), 'deuxieme dimanche').toBe(false);
    expect(estPremierDimancheDuMois(2026, 9, 7), 'un lundi').toBe(false);
  });
});

describe('les bornes de mois encadrent bien le classement', () => {
  it('le mois courant commence le premier et finit au premier suivant', () => {
    const { debut, fin } = bornesDuMois(new Date('2026-09-15T12:00:00Z'));
    expect(debut.getTime(), 'le debut precede la fin').toBeLessThan(fin.getTime());
    expect(fin.getTime() - debut.getTime(), 'environ trente jours').toBeGreaterThan(27 * 24 * 3600 * 1000);
  });

  it('le mois precedent est bien anterieur au mois courant', () => {
    const now = new Date('2026-09-15T12:00:00Z');
    expect(bornesDuMoisPrecedent(now).fin.getTime()).toBe(bornesDuMois(now).debut.getTime());
  });

  it('le passage de janvier remonte a decembre de l annee precedente', () => {
    const { debut } = bornesDuMoisPrecedent(new Date('2026-01-10T12:00:00Z'));
    expect(debut.getUTCFullYear(), 'annee precedente').toBe(2025);
  });
});

describe('le message de code reste discret et complet', () => {
  it('il porte le code, l heure britannique et la consigne de confidentialite', () => {
    const texte = texteCodeAcces('Saturday Chunin Tag Tournament', 'ABC123', NWL_CHUNIN_START_HOUR);
    expect(texte).toContain('ABC123');
    expect(texte, 'heure annoncee en britannique').toContain('21:00 BST');
    expect(texte.toLowerCase()).toContain('private');
  });
});

describe('les inscriptions ouvrent aussi longtemps avant que pour le tournoi du vendredi', () => {
  it('le delai entre ouverture et depart est le meme que celui du Genin', () => {
    expect(NWL_TIER_LEAD_HOURS).toBe(NWL_START_HOUR - NWL_REG_OPEN_HOUR);
    expect(NWL_TIER_LEAD_HOURS, 'huit heures, comme le vendredi').toBe(8);
  });

  it('les trois tournois ouvrent donc a la meme distance de leur depart', () => {
    expect(NWL_CHUNIN_START_HOUR - NWL_TIER_LEAD_HOURS, 'Chunin ouvert des 14h a Paris').toBe(14);
    expect(NWL_KAGE_START_HOUR - NWL_TIER_LEAD_HOURS, 'Kage ouvert des 13h a Paris').toBe(13);
  });
})
