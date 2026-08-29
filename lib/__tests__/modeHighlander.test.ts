import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  verifieDeckHighlander,
  estDeckHighlander,
  HIGHLANDER_MIN_DECK_SIZE,
  HIGHLANDER_MAX_COPIES_PER_VERSION,
} from '@/lib/highlander/deckRules';
import {
  classementDeLaPartie,
  classementDe,
  eloDuJoueur,
  partiesDuJoueur,
  CLASSEMENT_HIGHLANDER,
  CLASSEMENT_EVOLVING,
  CLASSEMENT_PRINCIPAL,
  CLASSEMENTS,
} from '@/lib/elo/classements';
import { MIN_DECK_SIZE, MAX_COPIES_PER_VERSION } from '@/lib/engine/types';

const RACINE = process.cwd();
const LOCALES = ['en', 'fr', 'es', 'pt', 'it', 'pl', 'ja'];
const MISSIONS = ['KS-MSS-01', 'KS-MSS-02', 'KS-MSS-03'];

function deck(nombre: number, prefixe = 'KS'): string[] {
  return Array.from({ length: nombre }, (_, i) => `${prefixe}-${String(i + 1).padStart(3, '0')}-C`);
}

describe('les regles de construction Highlander', () => {
  it('sont plus strictes que les regles normales', () => {
    expect(HIGHLANDER_MIN_DECK_SIZE).toBe(40);
    expect(HIGHLANDER_MIN_DECK_SIZE).toBeGreaterThan(MIN_DECK_SIZE);
    expect(HIGHLANDER_MAX_COPIES_PER_VERSION).toBe(1);
    expect(HIGHLANDER_MAX_COPIES_PER_VERSION).toBeLessThan(MAX_COPIES_PER_VERSION);
  });

  it('un deck de quarante cartes toutes differentes passe', () => {
    const verdict = verifieDeckHighlander(deck(40), MISSIONS);
    expect(verdict.compatible).toBe(true);
    expect(verdict.motifs).toEqual([]);
    expect(verdict.nombreDeCartes).toBe(40);
  });

  it('trente-neuf cartes ne suffisent pas, meme sans doublon', () => {
    const verdict = verifieDeckHighlander(deck(39), MISSIONS);
    expect(verdict.compatible).toBe(false);
    expect(verdict.motifs).toContain('tooFewCards');
  });

  it('une seule carte en double suffit a refuser le deck, et elle est nommee', () => {
    const cartes = [...deck(39), 'KS-001-C'];
    expect(cartes).toHaveLength(40);
    const verdict = verifieDeckHighlander(cartes, MISSIONS);
    expect(verdict.compatible).toBe(false);
    expect(verdict.motifs).toContain('duplicateVersion');
    expect(verdict.doublons.length).toBe(1);
  });

  it('deux illustrations de la meme carte comptent pour une seule copie', () => {
    const cartes = [...deck(39), 'KS-001-RA'];
    const verdict = verifieDeckHighlander(cartes, MISSIONS);
    expect(verdict.compatible, 'la variante partage la version de sa carte de base').toBe(false);
    expect(verdict.motifs).toContain('duplicateVersion');
  });

  it('il faut toujours exactement trois missions', () => {
    expect(verifieDeckHighlander(deck(40), ['KS-MSS-01']).motifs).toContain('missionCount');
    expect(verifieDeckHighlander(deck(40), [...MISSIONS, 'KS-MSS-04']).motifs).toContain('missionCount');
  });

  it('un deck classique de trente cartes avec doublons est refuse', () => {
    const classique = [...deck(30), ...deck(30)];
    expect(estDeckHighlander(classique, MISSIONS)).toBe(false);
  });
});

describe('le classement Highlander est un classement a part entiere', () => {
  it('une salle highlander compte sur les compteurs highlander', () => {
    const c = classementDeLaPartie({ isHighlander: true });
    expect(c).toBe(CLASSEMENT_HIGHLANDER);
    expect(c.eloField).toBe('highlanderElo');
    expect(c.winsField).toBe('highlanderWins');
    expect(c.lossesField).toBe('highlanderLosses');
    expect(c.compteurDeParties).toBe('highlanderGamesPlayed');
  });

  it('les trois classements ecrivent dans des champs strictement distincts', () => {
    const champs = CLASSEMENTS.flatMap((c) => [c.eloField, c.winsField, c.lossesField, c.drawsField]);
    expect(new Set(champs).size, 'aucun champ partage entre deux classements').toBe(champs.length);
  });

  it('une salle ordinaire et une salle evolving ne sont pas touchees', () => {
    expect(classementDeLaPartie({})).toBe(CLASSEMENT_PRINCIPAL);
    expect(classementDeLaPartie({ isEvolving: true })).toBe(CLASSEMENT_EVOLVING);
    expect(classementDe('highlander')).toBe(CLASSEMENT_HIGHLANDER);
    expect(classementDe('inconnu')).toBe(CLASSEMENT_PRINCIPAL);
  });

  it('l elo et le nombre de parties se lisent sur le bon classement', () => {
    const joueur = {
      elo: 1200, wins: 10, losses: 4, draws: 1,
      evolvingElo: 800, evolvingWins: 2, evolvingLosses: 2, evolvingDraws: 0,
      highlanderElo: 640, highlanderWins: 3, highlanderLosses: 1, highlanderDraws: 2,
    };
    expect(eloDuJoueur(CLASSEMENT_PRINCIPAL, joueur)).toBe(1200);
    expect(eloDuJoueur(CLASSEMENT_HIGHLANDER, joueur)).toBe(640);
    expect(partiesDuJoueur(CLASSEMENT_PRINCIPAL, joueur)).toBe(15);
    expect(partiesDuJoueur(CLASSEMENT_HIGHLANDER, joueur)).toBe(6);
  });

  it('un joueur sans partie highlander part de cinq cents', () => {
    expect(eloDuJoueur(CLASSEMENT_HIGHLANDER, { elo: 2000 })).toBe(500);
    expect(partiesDuJoueur(CLASSEMENT_HIGHLANDER, { elo: 2000 })).toBe(0);
  });
});

describe('le mode est branche de bout en bout', () => {
  it('la base connait le classement et la validite des decks', () => {
    const schema = readFileSync(join(RACINE, 'prisma/schema.prisma'), 'utf8');
    for (const champ of ['highlanderElo', 'highlanderWins', 'highlanderLosses', 'highlanderDraws', 'highlanderGamesPlayed']) {
      expect(schema, champ).toContain(champ);
    }
    expect(schema).toContain('highlanderCompatible');
    expect(schema).toContain('isHighlander');
  });

  it('le serveur refuse un deck qui ne respecte pas les regles', () => {
    const serveur = readFileSync(join(RACINE, 'lib/socket/server.ts'), 'utf8');
    expect(serveur).toContain('estDeckHighlander');
    expect(serveur).toContain("errorKey: 'room.error.highlanderDeckInvalid'");
  });

  it('le serveur refuse de creer ou rejoindre sans deck valide', () => {
    const serveur = readFileSync(join(RACINE, 'lib/socket/server.ts'), 'utf8');
    const occurrences = serveur.split("errorKey: 'room.error.highlanderNoDeck'").length - 1;
    expect(occurrences, 'creation, entree et file d attente').toBeGreaterThanOrEqual(3);
    expect(serveur).toContain('highlanderCompatible: true');
  });

  it('le gain et la perte d elo passent par le descripteur de classement', () => {
    const serveur = readFileSync(join(RACINE, 'lib/socket/server.ts'), 'utf8');
    expect(serveur).toContain('const classement = classementDeLaPartie(room);');
    expect(serveur, 'plus de champ evolving ecrit en dur dans le calcul').not.toContain("const eloField: 'elo' | 'evolvingElo' = isEvolving");
    expect(serveur).toContain('...compteurDeParties,');
  });

  it('les roles Discord restent reserves au classement principal', () => {
    const serveur = readFileSync(join(RACINE, 'lib/socket/server.ts'), 'utf8');
    const bloc = serveur.slice(serveur.indexOf('syncDiscordRole(room.hostId)') - 200, serveur.indexOf('syncDiscordRole(room.hostId)'));
    expect(bloc).toContain("classement.id === 'ranked'");
  });

  it('la liste des decks sait ne renvoyer que les decks valides', () => {
    const route = readFileSync(join(RACINE, 'app/api/decks/route.ts'), 'utf8');
    expect(route).toContain("searchParams.get('highlander') === 'true'");
    expect(route).toContain('estDeckHighlander');
    const selecteur = readFileSync(join(RACINE, 'components/game/DeckSelector.tsx'), 'utf8');
    expect(selecteur).toContain("'/api/decks?highlander=true'");
    expect(selecteur).toContain('highlanderOnly');
  });

  it('la page en ligne propose la case et n autorise que les decks valides', () => {
    const page = readFileSync(join(RACINE, 'app/[locale]/play/online/page.tsx'), 'utf8');
    expect(page).toContain('HighlanderToggleBlock');
    expect(page).toContain('highlanderToggleBlocked');
    expect(page).toContain('highlanderOnly={isHighlanderRoomActive}');
    expect(page, 'la case est bloquee sans deck valide').toContain('hasHighlander === false');
  });

  it('le classement et le profil montrent le mode', () => {
    const api = readFileSync(join(RACINE, 'app/api/leaderboard/route.ts'), 'utf8');
    expect(api).toContain("demande === 'highlander'");
    expect(api).toContain('highlanderElo');
    const page = readFileSync(join(RACINE, 'app/[locale]/leaderboard/page.tsx'), 'utf8');
    expect(page).toContain("handleBoardTypeChange('highlander')");
    const profil = readFileSync(join(RACINE, 'app/[locale]/profile/[username]/page.tsx'), 'utf8');
    expect(profil).toContain("'highlander'");
  });

  it('les sept langues ont les textes du mode', () => {
    for (const code of LOCALES) {
      const messages = JSON.parse(readFileSync(join(RACINE, `messages/${code}.json`), 'utf8'));
      const bloc = messages.online?.highlander;
      expect(bloc, `messages/${code}.json`).toBeTruthy();
      for (const cle of ['toggleLabel', 'toggleDescription', 'noDeckTitle', 'noDeck', 'createDeck', 'needDeckHint', 'noDeckInSelector']) {
        expect(bloc[cle], `${code}.online.highlander.${cle}`).toBeTruthy();
      }
      expect(messages.room.error.highlanderNoDeck, `${code} room.error.highlanderNoDeck`).toBeTruthy();
      expect(messages.room.error.highlanderDeckInvalid, `${code} room.error.highlanderDeckInvalid`).toBeTruthy();
      expect(messages.leaderboard.toggleType.highlander, `${code} toggleType`).toBeTruthy();
      expect(messages.profile.mode_highlander, `${code} mode_highlander`).toBeTruthy();
      expect(messages.online.badge.highlander, `${code} badge`).toBeTruthy();
    }
  });
});
