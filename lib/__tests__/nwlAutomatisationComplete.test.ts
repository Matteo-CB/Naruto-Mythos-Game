import { describe, it, expect } from 'vitest';
import {
  prochainSamedi,
  cleDeSemaine,
  estDansLaFenetreDeRappel,
  texteRecompenseGenin,
  texteRecompenseChunin,
  texteRecompenseKage,
  texteRappelAvantDepart,
  NWL_CHUNIN_START_HOUR,
  NWL_KAGE_LEAD_HOURS,
  NWL_KAGE_START_HOUR,
  NWL_RAPPEL_HEURES,
} from '@/lib/tournament/nwlTiers';
import { NWL_STORE_URL, NWL_INVITE_URL, NWL_START_HOUR } from '@/lib/tournament/nwlPartner';
import { prochainVendredi, NWL_GENIN_LEAD_HOURS } from '@/lib/tournament/nwlFridayTournament';
import { NWL_FIRST_PLACE_STORE_CREDIT_GBP } from '@/lib/tournament/weeklySchedule';

function partiesParis(d: Date) {
  const f = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', hour12: false,
  });
  return f.format(d);
}

describe('le Chunin se cale sur le samedi suivant la fin du Genin', () => {
  it('un Genin termine le vendredi soir vise le lendemain', () => {
    const vendrediSoir = new Date('2026-08-21T21:30:00Z');
    const samedi = prochainSamedi(vendrediSoir, NWL_CHUNIN_START_HOUR);
    expect(partiesParis(samedi)).toContain('22/08');
    expect(samedi.getTime()).toBeGreaterThan(vendrediSoir.getTime());
  });

  it('un Genin qui deborde apres minuit vise le samedi qui commence, pas le suivant', () => {
    const samediPetitMatin = new Date('2026-08-22T00:20:00Z');
    const samedi = prochainSamedi(samediPetitMatin, NWL_CHUNIN_START_HOUR);
    expect(partiesParis(samedi), 'toujours le 22, le soir meme').toContain('22/08');
  });

  it('un appel apres le depart du samedi vise le samedi de la semaine suivante', () => {
    const samediTard = new Date('2026-08-22T21:00:00Z');
    const samedi = prochainSamedi(samediTard, NWL_CHUNIN_START_HOUR);
    expect(partiesParis(samedi)).toContain('29/08');
  });
});

describe('la fenetre de rappel', () => {
  it('se declenche dans les deux heures avant le depart, jamais apres', () => {
    const depart = new Date('2026-08-22T20:00:00Z');
    const troisHeuresAvant = new Date(depart.getTime() - 3 * 60 * 60 * 1000);
    const uneHeureAvant = new Date(depart.getTime() - 60 * 60 * 1000);
    const apres = new Date(depart.getTime() + 60 * 1000);

    expect(estDansLaFenetreDeRappel(depart, troisHeuresAvant, NWL_RAPPEL_HEURES)).toBe(false);
    expect(estDansLaFenetreDeRappel(depart, uneHeureAvant, NWL_RAPPEL_HEURES)).toBe(true);
    expect(estDansLaFenetreDeRappel(depart, apres, NWL_RAPPEL_HEURES)).toBe(false);
  });

  it('laisse une marge pour un passage de cron qui tombe juste avant la barre', () => {
    const depart = new Date('2026-08-22T20:00:00Z');
    const deuxHeuresDix = new Date(depart.getTime() - (2 * 60 + 10) * 60 * 1000);
    expect(estDansLaFenetreDeRappel(depart, deuxHeuresDix, NWL_RAPPEL_HEURES)).toBe(true);
  });
});

describe('la cle de semaine ne bouge pas dans la meme semaine', () => {
  it('du lundi au dimanche, la meme cle', () => {
    const lundi = cleDeSemaine(new Date('2026-08-17T10:00:00Z'));
    expect(cleDeSemaine(new Date('2026-08-20T10:00:00Z'))).toBe(lundi);
    expect(cleDeSemaine(new Date('2026-08-23T18:00:00Z')), 'dimanche soir a Paris').toBe(lundi);
    expect(cleDeSemaine(new Date('2026-08-23T22:30:00Z')), 'minuit passe a Paris, on est deja lundi').not.toBe(lundi);
    expect(cleDeSemaine(new Date('2026-08-24T10:00:00Z')), 'le lundi suivant change de cle').not.toBe(lundi);
  });
});

describe('les messages de recompense disent au joueur ce qui l attend', () => {
  it('le Genin annonce le credit boutique et le lien', () => {
    const texte = texteRecompenseGenin();
    expect(texte).toContain(`£${NWL_FIRST_PLACE_STORE_CREDIT_GBP}`);
    expect(texte).toContain('email you used for the simulator');
    expect(texte).toContain(NWL_STORE_URL);
  });

  it('le Chunin annonce ses cinquante livres', () => {
    expect(texteRecompenseChunin()).toContain('£50');
    expect(texteRecompenseChunin()).toContain(NWL_STORE_URL);
  });

  it('le Kage demande les coordonnees a l organisateur, jamais au simulateur', () => {
    const texte = texteRecompenseKage();
    expect(texte).toContain('box will be sent out');
    expect(texte).toContain(NWL_INVITE_URL);
    expect(texte, 'les coordonnees vont a New World Loot, pas chez nous').toContain('New World Loot organisers');
  });

  it('le rappel annonce le nom du tournoi et le delai', () => {
    expect(texteRappelAvantDepart('Saturday Chunin Tag Tournament', 2)).toContain('starts in 2 hours');
  });
});

describe('le code du Kage part beaucoup plus tot que celui des autres', () => {
  it('vingt heures avant le depart, comme demande', () => {
    expect(NWL_KAGE_LEAD_HOURS).toBe(20);
    expect(NWL_KAGE_START_HOUR - NWL_KAGE_LEAD_HOURS, 'ouverture a 1h du matin a Paris').toBe(1);
  });
});

describe('le tournoi du vendredi ouvre vingt quatre heures avant', () => {
  it('le jeudi soir, la fenetre est ouverte et vise le vendredi suivant', () => {
    const jeudiSoir = new Date('2026-08-20T20:30:00Z');
    const vendredi = prochainVendredi(jeudiSoir, NWL_START_HOUR);
    expect(partiesParis(vendredi)).toContain('21/08');
    expect(
      vendredi.getTime() - jeudiSoir.getTime() <= NWL_GENIN_LEAD_HOURS * 3600 * 1000,
      'moins de vingt quatre heures avant le depart, donc creable',
    ).toBe(true);
  });

  it('le jeudi matin, c est encore trop tot', () => {
    const jeudiMatin = new Date('2026-08-20T08:00:00Z');
    const vendredi = prochainVendredi(jeudiMatin, NWL_START_HOUR);
    expect(
      vendredi.getTime() - jeudiMatin.getTime() > NWL_GENIN_LEAD_HOURS * 3600 * 1000,
      'plus de vingt quatre heures, on attend',
    ).toBe(true);
  });

  it('le vendredi apres le depart, la cible passe au vendredi suivant', () => {
    const vendrediTard = new Date('2026-08-21T21:00:00Z');
    expect(partiesParis(prochainVendredi(vendrediTard, NWL_START_HOUR))).toContain('28/08');
  });
});
