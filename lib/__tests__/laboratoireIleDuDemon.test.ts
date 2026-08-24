import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { initializeRegistry, getEffectHandler } from '@/lib/effects/EffectRegistry';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { GameEngine } from '@/lib/engine/GameEngine';
import {
  compterSonQuatreDansMission,
  compterMissionsAvecSonQuatre,
  coutsDesSonQuatreDansMission,
} from '@/lib/effects/soundFourCount';
import type { CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';

beforeAll(() => { initializeRegistry(); });

const LABO = 'SS-105-UC';
const LABO_COUT = 2;
const SON_QUATRE = 'KS-057-C';
const HORS_SON_QUATRE = 'KS-005-C';

function poserLabo(s: GameState, missionIndex: number, owner: PlayerID): void {
  const mission = s.activeMissions[missionIndex];
  mission.attachments = [
    ...(mission.attachments ?? []),
    { card: getCardById(LABO), owner, controlledBy: owner } as never,
  ];
}

function plateau(missions: number): GameState {
  const s = buildSimState({ p1: [], p2: [], missions, chakra1: 40, edgeHolder: 'player1' });
  s.phase = 'action';
  s.activePlayer = 'player1';
  s.player1.hand = [];
  s.player1.deck = Array.from({ length: 12 }, () => getCardById(HORS_SON_QUATRE)) as never;
  return s;
}

function poserPerso(s: GameState, missionIndex: number, id: string, player: PlayerID, instanceId: string): void {
  const cote = player === 'player1' ? 'player1Characters' : 'player2Characters';
  s.activeMissions[missionIndex][cote].push(
    simChar(id, { owner: player, instanceId, missionIndex }) as never,
  );
}

describe('le comptage du Son Quatre a une seule source de verite', () => {
  it('balaie toutes les combinaisons de laboratoires, de vrais Son Quatre et de camps', () => {
    let scenarios = 0;
    const ecarts: string[] = [];

    for (const nbMissions of [1, 2, 3, 4]) {
      for (let masqueLabo = 0; masqueLabo < 2 ** nbMissions; masqueLabo += 1) {
        for (let masqueReel = 0; masqueReel < 2 ** nbMissions; masqueReel += 1) {
          for (const proprietaireLabo of ['player1', 'player2'] as PlayerID[]) {
            for (const camp of ['player1', 'player2'] as PlayerID[]) {
              const s = plateau(nbMissions);
              for (let m = 0; m < nbMissions; m += 1) {
                if (masqueLabo & (1 << m)) poserLabo(s, m, proprietaireLabo);
                if (masqueReel & (1 << m)) poserPerso(s, m, SON_QUATRE, camp, `sf-${m}`);
              }

              let missionsAttendues = 0;
              for (let m = 0; m < nbMissions; m += 1) {
                const reel = (masqueReel & (1 << m)) ? 1 : 0;
                const virtuel = ((masqueLabo & (1 << m)) && proprietaireLabo === camp) ? 1 : 0;
                const total = reel + virtuel;

                const compte = compterSonQuatreDansMission(s, camp, m);
                if (compte !== total) {
                  ecarts.push(`mission ${m}: compte=${compte} attendu=${total}`);
                }
                if (total > 0) missionsAttendues += 1;
                scenarios += 1;
              }

              const missions = compterMissionsAvecSonQuatre(s, camp);
              if (missions !== missionsAttendues) {
                ecarts.push(`missions avec Son Quatre: ${missions} au lieu de ${missionsAttendues}`);
              }
              scenarios += 1;
            }
          }
        }
      }
    }

    expect(scenarios, 'le balayage couvre largement plus de mille situations').toBeGreaterThan(1000);
    expect(ecarts.slice(0, 8), `${ecarts.length} ecarts:\n${ecarts.slice(0, 8).join('\n')}`).toEqual([]);
  });

  it('un laboratoire adverse ne compte jamais pour vous', () => {
    const s = plateau(2);
    poserLabo(s, 0, 'player2');
    expect(compterSonQuatreDansMission(s, 'player1', 0)).toBe(0);
    expect(compterSonQuatreDansMission(s, 'player2', 0)).toBe(1);
  });

  it('un Son Quatre cache ne compte pas, le laboratoire si', () => {
    const s = plateau(2);
    poserPerso(s, 0, SON_QUATRE, 'player1', 'cache');
    (s.activeMissions[0].player1Characters[0] as CharacterInPlay).isHidden = true;
    expect(compterSonQuatreDansMission(s, 'player1', 0), 'un personnage cache est anonyme').toBe(0);
    poserLabo(s, 0, 'player1');
    expect(compterSonQuatreDansMission(s, 'player1', 0)).toBe(1);
  });

  it('la carte source ne se compte pas elle-meme, le laboratoire reste', () => {
    const s = plateau(2);
    poserPerso(s, 0, SON_QUATRE, 'player1', 'source');
    poserLabo(s, 0, 'player1');
    expect(compterSonQuatreDansMission(s, 'player1', 0, 'source')).toBe(1);
    expect(compterSonQuatreDansMission(s, 'player1', 0)).toBe(2);
  });

  it('le Son Quatre virtuel apporte le cout imprime du laboratoire', () => {
    const s = plateau(2);
    poserLabo(s, 0, 'player1');
    expect(coutsDesSonQuatreDansMission(s, 'player1', 0)).toEqual([LABO_COUT]);
    poserPerso(s, 0, SON_QUATRE, 'player1', 'reel');
    const couts = coutsDesSonQuatreDansMission(s, 'player1', 0).sort((a, b) => a - b);
    expect(couts.length, 'le vrai et le virtuel').toBe(2);
    expect(couts).toContain(LABO_COUT);
  });
});

describe('les cartes qui comptent le Son Quatre voient le laboratoire', () => {
  function joueEtCompte(carteId: string, avecLabo: boolean, missionsAvecLabo: number[]): GameState {
    const s = plateau(3);
    for (const m of missionsAvecLabo) if (avecLabo) poserLabo(s, m, 'player1');
    poserPerso(s, 0, HORS_SON_QUATRE, 'player1', 'socle');
    s.player1.hand = [getCardById(carteId)] as never;
    return GameEngine.applyAction(s, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0,
    } as never);
  }

  for (const [carte, nom] of [
    ['KS-057-C', 'JIROBO 057 POWERUP X'],
    ['KS-059-C', 'KIDOMARU 059 deplace X'],
    ['KS-061-C', 'SAKON 061 pioche X'],
  ] as const) {
    it(`${nom} ouvre sa fenetre grace au seul laboratoire`, () => {
      const sans = joueEtCompte(carte, false, []);
      expect(
        sans.log.some((l) => l.messageKey === 'game.log.effect.noTarget'),
        'sans laboratoire ni Son Quatre, la carte ne trouve rien',
      ).toBe(true);

      const avec = joueEtCompte(carte, true, [1, 2]);
      expect(
        avec.pendingActions.length,
        'deux laboratoires suffisent a activer l effet, sans aucun vrai Son Quatre',
      ).toBeGreaterThan(0);
    });
  }

  it('SAKON 061 pioche bien une carte par mission comptee', () => {
    for (const missionsAvecLabo of [[0], [0, 1], [0, 1, 2]]) {
      const s = plateau(3);
      for (const m of missionsAvecLabo) poserLabo(s, m, 'player1');
      poserPerso(s, 0, HORS_SON_QUATRE, 'player1', 'socle');
      s.player1.hand = [getCardById('KS-061-C')] as never;

      let etat = GameEngine.applyAction(s, 'player1', {
        type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0,
      } as never);
      const mainAvant = etat.player1.hand.length;

      let garde = 0;
      while (etat.pendingActions.length > 0 && garde < 4) {
        const q = etat.pendingActions[0];
        etat = GameEngine.applyAction(etat, q.player, {
          type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [q.options[0]],
        } as never);
        garde += 1;
      }

      expect(
        etat.player1.hand.length - mainAvant,
        `${missionsAvecLabo.length} laboratoire(s) doivent faire piocher ${missionsAvecLabo.length} carte(s)`,
      ).toBe(missionsAvecLabo.length);
    }
  });

  it('DOKI 066 vole du chakra grace au seul laboratoire de sa mission', () => {
    const s = plateau(2);
    poserLabo(s, 0, 'player1');
    poserPerso(s, 0, HORS_SON_QUATRE, 'player1', 'socle');
    s.player2.chakra = 5;
    s.player1.hand = [getCardById('KS-066-UC')] as never;

    let etat = GameEngine.applyAction(s, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0,
    } as never);
    let garde = 0;
    while (etat.pendingActions.length > 0 && garde < 4) {
      const q = etat.pendingActions[0];
      etat = GameEngine.applyAction(etat, q.player, {
        type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [q.options[0]],
      } as never);
      garde += 1;
    }
    expect(etat.player2.chakra, 'le chakra adverse a bien ete vole').toBeLessThan(5);
  });
});

describe('personne ne recompte le Son Quatre dans son coin', () => {
  const RACINE = join(__dirname, '..', '..');
  const AUTORISES = new Set([
    'lib/effects/soundFourCount.ts',
    'lib/effects/handlers/SS/sakon037.ts',
  ]);

  function fichiers(dossier: string): string[] {
    const complet = join(RACINE, dossier);
    let entrees: string[] = [];
    try { entrees = readdirSync(complet); } catch { return []; }
    const trouves: string[] = [];
    for (const e of entrees) {
      const chemin = join(complet, e);
      if (statSync(chemin).isDirectory()) trouves.push(...fichiers(join(dossier, e)));
      else if (e.endsWith('.ts')) trouves.push(join(dossier, e));
    }
    return trouves;
  }

  it('tout comptage de personnages Son Quatre en jeu passe par l aide partagee', () => {
    const fautifs: string[] = [];
    for (const dossier of ['lib/effects', 'lib/engine']) {
      for (const rel of fichiers(dossier)) {
        const chemin = rel.split('\\').join('/');
        if (chemin.includes('__tests__')) continue;
        if (AUTORISES.has(chemin)) continue;
        const contenu = readFileSync(join(RACINE, rel), 'utf8');
        if (contenu.includes("includes('Sound Four')")) fautifs.push(chemin);
      }
    }
    expect(
      fautifs,
      "compter les Son Quatre a la main ignore LABORATOIRE DE L ILE DU DEMON 105, qui ajoute un "
      + 'personnage Son Quatre virtuel dans sa mission. Passer par compterSonQuatreDansMission ou '
      + 'compterMissionsAvecSonQuatre.\n' + fautifs.join('\n'),
    ).toEqual([]);
  });

  it('les effets qui visent de vrais personnages le disent dans le nom', () => {
    for (const f of [
      'lib/effects/handlers/KS/uncommon/jirobo058.ts',
      'lib/effects/handlers/KS/uncommon/sakon062.ts',
      'lib/effects/handlers/SS/kidomaru035.ts',
    ]) {
      const src = readFileSync(join(RACINE, f), 'utf8');
      expect(
        src,
        `${f}: poser un jeton, copier un effet ou lire un cout demande un personnage reel, `
        + 'le Son Quatre virtuel du laboratoire n en est pas un',
      ).toContain('estSonQuatreReel');
    }
  });

  it('la seule lecture hors plateau est celle de la main', () => {
    const sakon037 = readFileSync(join(RACINE, 'lib/effects/handlers/SS/sakon037.ts'), 'utf8');
    expect(sakon037, 'SAKON 037 revele depuis la main, le laboratoire ne s y trouve pas').toContain('hand');
  });
});
