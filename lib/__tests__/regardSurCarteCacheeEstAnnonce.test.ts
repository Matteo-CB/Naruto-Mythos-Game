import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import { annoncerRegardIndiscret, annoncerRevelationPublique, apercuRevele } from '@/lib/effects/publicReveal';
import { getCardById } from '@/lib/data/cardIndex';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { CardData, GameState } from '@/lib/engine/types';

const RACINE = process.cwd();
const LOCALES = ['en', 'fr', 'es', 'pt', 'it', 'pl', 'ja'];
const RECONNAISSANCE = 'SS-002-MMS';
const CACHEE = 'KS-005-C';

function plateau(): GameState {
  return buildSimState({
    p1: [simChar('KS-009-C', { owner: 'player1', instanceId: 'a-moi' })],
    p2: [simChar(CACHEE, { owner: 'player2', instanceId: 'cachee-adverse', hidden: true })],
    missions: 2,
    chakra1: 20,
  });
}

function carteCachee(state: GameState) {
  return state.activeMissions[0].player2Characters[0];
}

describe('regarder une carte cachee adverse le fait savoir a son proprietaire', () => {
  beforeAll(() => { initializeRegistry(); });

  it('l annonce vise le proprietaire, pas l observateur', () => {
    const state = plateau();
    const apres = annoncerRegardIndiscret(state, 'player1', carteCachee(state), RECONNAISSANCE);
    expect(apres.publicReveal).toBeTruthy();
    expect(apres.publicReveal?.destinataire).toBe('player2');
    expect(apres.publicReveal?.player).toBe('player1');
    expect(apres.publicReveal?.motif).toBe('regard');
    expect(apres.publicReveal?.cards[0]?.name_fr).toBe(getCardById(CACHEE)?.name_fr);
  });

  it('regarder sa propre carte cachee n annonce rien, sinon c est une fuite', () => {
    const state = buildSimState({
      p1: [simChar(CACHEE, { owner: 'player1', instanceId: 'la-mienne', hidden: true })],
      p2: [], missions: 2, chakra1: 20,
    });
    const mienne = state.activeMissions[0].player1Characters[0];
    const apres = annoncerRegardIndiscret(state, 'player1', mienne, RECONNAISSANCE);
    expect(apres.publicReveal ?? null).toBeNull();
  });

  it('seul le proprietaire recoit l annonce dans son etat visible', () => {
    const state = plateau();
    const apres = annoncerRegardIndiscret(state, 'player1', carteCachee(state), RECONNAISSANCE);

    const vuParLeProprietaire = GameEngine.getVisibleState(apres, 'player2');
    const vuParLObservateur = GameEngine.getVisibleState(apres, 'player1');

    expect(vuParLeProprietaire.publicReveal?.motif, 'le proprietaire est prevenu').toBe('regard');
    expect(vuParLObservateur.publicReveal, 'l observateur ne recoit rien').toBeNull();
  });

  it('une revelation publique ordinaire continue d atteindre les deux camps', () => {
    const state = plateau();
    const carte = getCardById(CACHEE) as CardData;
    const apres = annoncerRevelationPublique(state, 'player1', 'SS-046-UC', [apercuRevele(carte, true)]);
    expect(GameEngine.getVisibleState(apres, 'player1').publicReveal).toBeTruthy();
    expect(GameEngine.getVisibleState(apres, 'player2').publicReveal).toBeTruthy();
  });

  it('le filtre est bien celui du destinataire, pas celui de la source', () => {
    expect(GameEngine.revelationVisiblePour(null, 'player1')).toBeNull();
    const ciblee = { id: 'x', player: 'player1' as const, sourceCardId: RECONNAISSANCE, cards: [], destinataire: 'player2' as const };
    expect(GameEngine.revelationVisiblePour(ciblee, 'player2')).toBe(ciblee);
    expect(GameEngine.revelationVisiblePour(ciblee, 'player1')).toBeNull();
    const ouverte = { id: 'y', player: 'player1' as const, sourceCardId: 'SS-046-UC', cards: [] };
    expect(GameEngine.revelationVisiblePour(ouverte, 'player1')).toBe(ouverte);
    expect(GameEngine.revelationVisiblePour(ouverte, 'player2')).toBe(ouverte);
  });

  it('les spectateurs ne recoivent jamais une annonce nominative', () => {
    const serveur = readFileSync(join(RACINE, 'lib/socket/server.ts'), 'utf8');
    const bloc = serveur.slice(serveur.indexOf('function buildSpectatorState'), serveur.indexOf('function envoyerAuSiege'));
    expect(bloc, 'la vue spectateur efface toute annonce adressee a un joueur')
      .toContain('publicReveal: p1State.publicReveal?.destinataire ? null : p1State.publicReveal');
  });

  it('Reconnaissance previent bien le proprietaire quand elle regarde', () => {
    const moteur = readFileSync(join(RACINE, 'lib/effects/EffectEngine.ts'), 'utf8');
    const bloc = moteur.slice(moteur.indexOf("case 'SSMSS02_LOOK_HIDDEN'"), moteur.indexOf("case 'SSMSS02_LOOK_REVEAL'"));
    expect(bloc).toContain("annoncerRegardIndiscret(newState, m2Player, m2Located.character, 'SS-002-MMS')");
  });

  it('le message existe dans les sept langues et nomme la carte source', () => {
    for (const code of LOCALES) {
      const messages = JSON.parse(readFileSync(join(RACINE, `messages/${code}.json`), 'utf8'));
      const texte = messages.game?.publicReveal?.regardTitle;
      expect(texte, `${code}: le titre du regard existe`).toBeTruthy();
      expect(texte, `${code}: il nomme la carte source`).toContain('{card}');
    }
  });

  it('tout regard sur une carte cachee previent son proprietaire, pas seulement Reconnaissance', () => {
    const moteur = readFileSync(join(RACINE, 'lib/effects/EffectEngine.ts'), 'utf8');
    const declencheurs = readFileSync(join(RACINE, 'lib/effects/moveTriggers.ts'), 'utf8');
    const source = moteur + declencheurs;

    const regards = (source.match(/game\.log\.effect\.lookAtHidden/g) ?? []).length;
    const memorises = (source.match(/rememberPeek\(/g) ?? []).length;
    const annonces = (source.match(/annoncerRegardIndiscret\(/g) ?? []).length;
    expect(regards, 'les sites de regard connus sont toujours la').toBeGreaterThanOrEqual(5);
    expect(memorises, 'les coups d oeil memorises sont toujours la').toBeGreaterThanOrEqual(2);
    expect(
      annonces,
      'chaque regard et chaque coup d oeil previent le proprietaire, plus celui de Reconnaissance',
    ).toBeGreaterThanOrEqual(regards + memorises + 1);
  });

  it('un coup d oeil memorise previent aussi le proprietaire', () => {
    const moteur = readFileSync(join(RACINE, 'lib/effects/EffectEngine.ts'), 'utf8');
    for (const cas of ['SS_PEEK_HIDDEN', 'SS014_PEEK_AND_DEFEAT']) {
      const debut = moteur.indexOf(`case '${cas}'`);
      expect(debut, `${cas} existe`).toBeGreaterThan(0);
      const bloc = moteur.slice(debut, debut + 1400);
      expect(bloc, `${cas} previent le proprietaire`).toContain('annoncerRegardIndiscret(');
      const ordre = bloc.indexOf('rememberPeek(') < bloc.indexOf('annoncerRegardIndiscret(');
      expect(ordre, `${cas} annonce apres avoir memorise`).toBe(true);
    }
  });

  it('l annonce ne part jamais quand l observateur regarde son propre camp', () => {
    const helper = readFileSync(join(RACINE, 'lib/effects/publicReveal.ts'), 'utf8');
    const bloc = helper.slice(helper.indexOf('export function annoncerRegardIndiscret'));
    expect(bloc, 'le garde-fou contre la fuite est en tete de fonction')
      .toContain('if (!proprietaire || proprietaire === observateur) return state;');
  });

  it('la fenetre distingue le regard de la revelation', () => {
    const composant = readFileSync(join(RACINE, 'components/game/PublicRevealOverlay.tsx'), 'utf8');
    expect(composant).toContain("affichee.motif === 'regard'");
    expect(composant).toContain('game.publicReveal.regardTitle');
  });
});
