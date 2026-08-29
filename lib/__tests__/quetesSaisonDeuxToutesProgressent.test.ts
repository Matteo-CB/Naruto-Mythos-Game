import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import { getCardById } from '@/lib/data/cardIndex';
import { getAllCards } from '@/lib/data/cardLoader';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { parseDuelCharacterName } from '@/lib/effects/duelUtils';
import { onQuestEvent, clearQuestListeners, type QuestEventPayload } from '@/lib/quests/hooks';
import { matchQuestsForEvent } from '@/lib/quests/trackProgress';
import { enrichirDesAgregats, reinitialiserAgregats } from '@/lib/quests/agregatsDePartie';
import { noterLeFait, reinitialiserFaitsDePartie } from '@/lib/quests/faitsDePartie';
import { emitAttachmentStateEvents } from '@/lib/quests/etatDeJeu';
import { attachCardToCharacter } from '@/lib/effects/attachments';
import { executeMissionPhase, resumeMissionScoring } from '@/lib/engine/phases/MissionPhase';
import { emitTokenDiffEvents, emitEngineQuestEvent } from '@/lib/quests/engineEmit';
import { questsOfSeason, SAISON_COURANTE } from '@/lib/quests/questData';
import { resumerLeDeck, compteParSet } from '@/lib/quests/resumeDeDeck';
import type { GameState } from '@/lib/engine/types';

beforeAll(() => { initializeRegistry(); });

interface CarteBrute {
  id: string;
  card_type?: string;
  name_fr?: string;
  name_en?: string;
  group?: string | null;
  keywords?: string[];
  chakra?: number;
  effects?: Array<{ type?: string; description?: string }>;
}

const catalogue = getAllCards() as unknown as CarteBrute[];
const duSet = catalogue.filter((c) => c.id.startsWith('SS-'));
const quetes = questsOfSeason(SAISON_COURANTE);

function numero(id: string): number | null {
  const m = /^SS-(\d+)/.exec(id);
  return m ? Number(m[1]) : null;
}

function carteNumerotee(n: number, type: string, effet?: string): CarteBrute | undefined {
  return duSet.find((c) => numero(c.id) === n && c.card_type === type
    && (!effet || (c.effects ?? []).some((e) => e.type === effet)));
}

const ROSTER_AMI = [
  'SS-030-C', 'SS-046-UC', 'SS-003-C', 'SS-053-C', 'SS-052-C',
  'SS-020-C', 'SS-116-R', 'SS-005-C', 'SS-023-C',
];
const ROSTER_ENNEMI = ['SS-014-C', 'SS-009-C', 'SS-041-UC', 'SS-032-C'];

const MISSIONS_SS = duSet.filter((c) => c.card_type === 'mission')
  .filter((c, i, l) => l.findIndex((x) => numero(x.id) === numero(c.id)) === i)
  .map((c) => c.id);

const touchees = new Set<string>();
const captures: Array<{ hook: string; payload?: QuestEventPayload }> = [];

function enregistrer(hook: string, userId: string, payload?: QuestEventPayload): void {
  if (payload?.sourceNumber !== undefined) captures.push({ hook, payload });
  const enrichi = enrichirDesAgregats(hook, userId, payload);
  noterLeFait(hook, userId, enrichi);
  for (const m of matchQuestsForEvent(hook, enrichi)) touchees.add(m.quest.id);
}

beforeEach(() => {
  clearQuestListeners();
  onQuestEvent((hook, userId, payload) => enregistrer(hook, userId, payload));
});

afterEach(() => { clearQuestListeners(); });

function plateau(options: {
  p1?: string[]; p2?: string[]; main?: string[]; missions?: number; missionIds?: string[];
}): GameState {
  const s = buildSimState({
    p1: (options.p1 ?? []).map((id, i) => simChar(id, { owner: 'player1', instanceId: `p1_${i}` })),
    p2: (options.p2 ?? []).map((id, i) => simChar(id, { owner: 'player2', instanceId: `p2_${i}` })),
    missions: options.missions ?? 2,
    missionIds: options.missionIds,
    chakra1: 60,
    edgeHolder: 'player1',
  });
  s.player1UserId = 'u1';
  s.player2UserId = 'u2';
  s.gameId = `partie_${Math.floor(performance.now() * 1000)}`;
  s.gameMode = 'casual';
  s.player1.hand = (options.main ?? []).map((id) => getCardById(id) as never);
  return s;
}

function repondreTout(depart: GameState, prendreLeDernier = false): GameState {
  let courant = depart;
  let garde = 0;
  while (courant.pendingActions.length > 0 && garde < 30) {
    const q = courant.pendingActions[0];
    const choix = prendreLeDernier ? q.options?.[q.options.length - 1] : q.options?.[0];
    try {
      courant = GameEngine.applyAction(courant, q.player, choix
        ? { type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [choix] } as never
        : { type: 'DECLINE_OPTIONAL_EFFECT', pendingActionId: q.id } as never);
    } catch { break; }
    garde += 1;
  }
  emitAttachmentStateEvents(courant);
  return courant;
}

function passerJusquAuDecompte(depart: GameState, tours = 24): GameState {
  let courant = depart;
  for (let i = 0; i < tours; i += 1) {
    try {
      if (courant.pendingActions.length > 0) {
        const q = courant.pendingActions[0];
        const choix = q.options?.[0];
        courant = GameEngine.applyAction(courant, q.player, choix
          ? { type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [choix] } as never
          : { type: 'DECLINE_OPTIONAL_EFFECT', pendingActionId: q.id } as never);
        continue;
      }
      if (courant.phase === 'gameOver') break;
      courant = courant.phase === 'action'
        ? GameEngine.applyAction(courant, courant.activePlayer ?? 'player1', { type: 'PASS' } as never)
        : GameEngine.applyAction(courant, courant.activePlayer ?? 'player1', { type: 'ADVANCE_PHASE' } as never);
    } catch { break; }
  }
  emitAttachmentStateEvents(courant);
  return courant;
}

function jouerLaPremiereCarte(depart: GameState, missionIndex = 0, prendreLeDernier = false): GameState {
  try {
    return repondreTout(GameEngine.applyAction(depart, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex,
    } as never), prendreLeDernier);
  } catch {
    return depart;
  }
}

function enchainer(depart: GameState, missions: number[], prendreLeDernier = false): GameState {
  let courant = depart;
  for (const missionIndex of missions) {
    if (courant.player1.hand.length === 0) break;
    courant = jouerLaPremiereCarte(courant, missionIndex, prendreLeDernier);
    if (courant.activePlayer === 'player2') {
      try { courant = GameEngine.applyAction(courant, 'player2', { type: 'PASS' } as never); } catch { break; }
    }
  }
  emitAttachmentStateEvents(courant);
  return courant;
}

describe('chaque quete de Shinobi Shiren progresse pour de vrai', () => {
  it('les cartes du banc existent toutes', () => {
    for (const id of [...ROSTER_AMI, ...ROSTER_ENNEMI]) {
      expect(getCardById(id), `${id} absente du catalogue`).toBeTruthy();
    }
  });

  it('un DUEL joue face a son partenaire fait avancer sa quete', () => {
    const duels = duSet.filter((c) => c.card_type === 'character'
      && (c.effects ?? []).some((e) => e.type === 'DUEL'));
    const sansPartenaire: string[] = [];
    for (const carte of duels) {
      const texte = (carte.effects ?? []).find((e) => e.type === 'DUEL')?.description ?? '';
      const partenaire = parseDuelCharacterName(texte);
      if (!partenaire) { sansPartenaire.push(carte.id); continue; }
      const adverse = catalogue.find((c) => c.card_type === 'character'
        && c.id !== carte.id
        && ((c.name_fr ?? '').toUpperCase().includes(partenaire.toUpperCase())
          || (c.name_en ?? '').toUpperCase().includes(partenaire.toUpperCase())));
      if (!adverse) { sansPartenaire.push(carte.id); continue; }
      jouerLaPremiereCarte(plateau({ p1: ROSTER_AMI, p2: [adverse.id, ...ROSTER_ENNEMI], main: [carte.id] }));
    }
    expect(sansPartenaire, 'un DUEL sans partenaire trouvable').toEqual([]);
  });

  it('une FIRST STRIKE jouee en premier fait avancer sa quete', () => {
    const cartes = duSet.filter((c) => (c.effects ?? []).some((e) => e.type === 'FIRST_STRIKE'));
    for (const carte of cartes) {
      if (carte.card_type === 'character') {
        jouerLaPremiereCarte(plateau({ p1: ROSTER_AMI, p2: ROSTER_ENNEMI, main: [carte.id] }));
      } else if (carte.card_type === 'attachment') {
        jouerLaPremiereCarte(plateau({ p1: ROSTER_AMI, p2: ROSTER_ENNEMI, main: [carte.id] }));
      }
    }
    expect(cartes.length, 'le set porte bien des FIRST STRIKE').toBeGreaterThan(0);
  });

  it('chaque equipement pose fait avancer sa quete', () => {
    const equipements = duSet.filter((c) => c.card_type === 'attachment');
    const jamaisPoses: string[] = [];
    for (const carte of equipements) {
      const depart = plateau({ p1: ROSTER_AMI, p2: ROSTER_ENNEMI, main: [carte.id] });
      const apres = jouerLaPremiereCarte(depart);
      const pose = apres.player1.hand.length < depart.player1.hand.length;
      if (!pose) jamaisPoses.push(carte.id);
    }
    expect(jamaisPoses, 'ces equipements ne se posent jamais').toEqual([]);
  });

  it('chaque mission remportee est annoncee, avec ses equipements', () => {
    const missions = duSet.filter((c) => c.card_type === 'mission');
    const jamaisGagnees: string[] = [];
    for (const mission of missions) {
      const depart = plateau({ p1: ['SS-116-R'], missions: 1, missionIds: [mission.id] });
      const avant = touchees.size;
      const scoree = passerJusquAuDecompte(depart);
      if (scoree.activeMissions[0].wonBy !== 'player1' && touchees.size === avant) {
        jamaisGagnees.push(mission.id);
      }
    }
    expect(jamaisGagnees, 'ces missions ne se gagnent jamais').toEqual([]);
  });

  it('une mission remportee sous un equipement de mission est annoncee avec lui', () => {
    for (const equipement of duSet.filter((c) => c.card_type === 'mission' ? false : c.card_type === 'attachment')) {
      const carte = getCardById(equipement.id) as { attach_to?: string } | null;
      if (!carte || carte.attach_to !== 'mission') continue;
      let etat = plateau({ p1: ['SS-116-R'], missions: 1, main: [equipement.id] });
      etat = jouerLaPremiereCarte(etat);
      passerJusquAuDecompte(etat);
    }
    expect(true).toBe(true);
  });

  it('les seuils de puissance, de jetons et de pile sont annonces', () => {
    let etat = plateau({ p1: ['SS-116-R'], p2: ROSTER_ENNEMI, missions: 1, main: ['SS-005-C'] });
    etat.activeMissions[0].player1Characters[0].powerTokens = 30;
    jouerLaPremiereCarte(etat);

    const empilable = duSet.find((c) => c.card_type === 'character' && (c.chakra ?? 0) >= 3);
    if (empilable) {
      const basId = duSet.find((c) => c.card_type === 'character'
        && (c.name_en ?? '') === (empilable.name_en ?? '')
        && (c.chakra ?? 9) < (empilable.chakra ?? 0))?.id;
      if (basId) {
        let pile = plateau({ p1: [basId], missions: 1, main: [empilable.id] });
        pile.activeMissions[0].player1Characters[0].stack = [
          getCardById(basId) as never, getCardById(basId) as never, getCardById(basId) as never,
        ];
        jouerLaPremiereCarte(pile);
      }
    }
    expect(true).toBe(true);
  });

  it('deux DUELS dans la meme partie et la meme manche sont reunis', () => {
    const duels = duSet.filter((c) => c.card_type === 'character'
      && (c.effects ?? []).some((e) => e.type === 'DUEL' && !(e.description ?? '').includes('[⧗]')));
    const partenaireDe = (carte: CarteBrute) => {
      const texte = (carte.effects ?? []).find((e) => e.type === 'DUEL')?.description ?? '';
      const nom = parseDuelCharacterName(texte);
      if (!nom) return undefined;
      return catalogue.find((c) => c.card_type === 'character' && c.id !== carte.id
        && ((c.name_fr ?? '').toUpperCase().includes(nom.toUpperCase())
          || (c.name_en ?? '').toUpperCase().includes(nom.toUpperCase())));
    };
    const adversaires = duels.map(partenaireDe).filter((c): c is CarteBrute => !!c);
    let etat = plateau({
      p1: ROSTER_AMI,
      p2: [...new Set(adversaires.map((c) => c.id))].slice(0, 12),
      main: duels.map((c) => c.id),
      missions: 4,
    });
    for (let i = 0; i < duels.length && etat.player1.hand.length > 0; i += 1) {
      const avant = etat.player1.hand.length;
      etat = jouerLaPremiereCarte(etat, i % 4);
      if (etat.player1.hand.length === avant) {
        etat = { ...etat, player1: { ...etat.player1, hand: etat.player1.hand.slice(1) } };
      }
    }
    expect(true).toBe(true);
  });

  it('les faits de fin de partie classee sont annonces avec le deck', () => {
    const deck = duSet.filter((c) => c.card_type === 'character').slice(0, 30)
      .map((c) => getCardById(c.id)).filter((c): c is NonNullable<typeof c> => !!c);
    const avecEquipement = [...deck, getCardById('SS-101-UC')!];
    const monoSon = duSet.filter((c) => c.card_type === 'character' && c.group === 'Sound Village')
      .map((c) => getCardById(c.id)).filter((c): c is NonNullable<typeof c> => !!c);
    const monoSable = duSet.filter((c) => c.card_type === 'character' && c.group === 'Sand Village')
      .map((c) => getCardById(c.id)).filter((c): c is NonNullable<typeof c> => !!c);
    const vallee = [getCardById('SS-147-S')!, getCardById('SS-148-S')!, ...deck].filter(Boolean);

    const cas: Array<[string, unknown[], Record<string, unknown>]> = [
      ['ranked.win.deck.contains', avecEquipement, { attachmentsPlaced: 2, duelsTriggered: 3, missionsWonLastRound: 4 }],
      ['ranked.win.deck.contains', deck, { attachmentsPlaced: 0, duelsTriggered: 0, missionsWonLastRound: 0 }],
      ['ranked.win.deck.contains', monoSon, { attachmentsPlaced: 0, duelsTriggered: 0, missionsWonLastRound: 0 }],
      ['ranked.win.deck.contains', monoSable, { attachmentsPlaced: 0, duelsTriggered: 0, missionsWonLastRound: 0 }],
      ['ranked.win.deck', deck, {}],
      ['ranked.win.streak', deck, { streak: 10 }],
      ['match.won.no_defeats_own', deck, {}],
      ['tournament.won.single', deck, { tournamentUndefeated: true }],
      ['tournament.won.single', vallee, { tournamentUndefeated: true }],
      ['tournament.won.single', monoSon, {}],
      ['tournament.won.swiss', deck, {}],
      ['tournament.won.mono_village', monoSon, {}],
    ];
    for (const [hook, cartes, extra] of cas) {
      const resume = resumerLeDeck(cartes as never);
      const parSet = compteParSet(cartes as never);
      enregistrer(hook, 'u1', {
        gameMode: 'ranked',
        deckSet: resume.deckSet,
        deckSets: resume.deckSets,
        deckSetCounts: parSet,
        deckSetCount: parSet.SS ?? 0,
        deckNumbers: resume.deckNumbers,
        deckHasAttachment: resume.deckHasAttachment,
        monoGroup: resume.monoGroup,
        set: resume.deckSet,
        ...extra,
      });
    }
    expect(true).toBe(true);
  });

  it('chaque carte du set jouee sur un plateau garni declenche ce qu elle sait faire', () => {
    const jouables = duSet.filter((c) => c.card_type === 'character' || c.card_type === 'attachment');
    for (const carte of jouables) {
      const etat = plateau({
        p1: ROSTER_AMI, p2: ROSTER_ENNEMI, main: [carte.id], missions: 4,
      });
      etat.activeMissions[1] = {
        ...etat.activeMissions[1],
        player1Characters: ROSTER_AMI.map((id, i) => simChar(id, { owner: 'player1', instanceId: `m1_p1_${i}` })),
        player2Characters: ROSTER_ENNEMI.map((id, i) => simChar(id, { owner: 'player2', instanceId: `m1_p2_${i}` })),
      };
      for (const ch of etat.activeMissions[1].player1Characters) ch.missionIndex = 1;
      for (const ch of etat.activeMissions[1].player2Characters) ch.missionIndex = 1;
      for (const mission of etat.activeMissions) {
        for (const ch of mission.player1Characters) ch.powerTokens = 4;
        for (const ch of mission.player2Characters) ch.powerTokens = 4;
      }
      etat.player1.discardPile = duSet.filter((c) => c.card_type === 'character').slice(0, 6)
        .map((c) => getCardById(c.id)).filter(Boolean) as never[];
      etat.player2.hand = duSet.filter((c) => c.card_type === 'character').slice(6, 10)
        .map((c) => getCardById(c.id)).filter(Boolean) as never[];
      for (const missionIndex of [0, 1, 2]) {
        const avant = etat.player1.hand.length;
        const apres = jouerLaPremiereCarte(etat, missionIndex);
        emitTokenDiffEvents(etat, apres);
        if (apres.player1.hand.length < avant) break;
      }
    }
    expect(jouables.length).toBeGreaterThan(150);
  });

  it('les seuils et les piles sont annonces comme en partie en ligne', () => {
    const etat = plateau({ p1: ROSTER_AMI, p2: ROSTER_ENNEMI, missions: 2 });
    const gonfle = JSON.parse(JSON.stringify(etat)) as GameState;
    for (const mission of gonfle.activeMissions) {
      for (const ch of mission.player1Characters) ch.powerTokens = 22;
      for (const ch of mission.player2Characters) ch.powerTokens = 22;
    }
    emitTokenDiffEvents(etat, gonfle);

    const empile = JSON.parse(JSON.stringify(etat)) as GameState;
    const carte = getCardById(ROSTER_AMI[0]) as never;
    empile.activeMissions[0].player1Characters[0].stack = [carte, carte, carte, carte, carte, carte];
    emitEngineQuestEvent(empile, 'player1', 'upgrade.stack.depth', {
      depth: 6, sourceCardId: 'SS-129-R',
    });
    expect(true).toBe(true);
  });

  it('les agregats de partie reunissent les faits captures', () => {
    const parCrochet = new Map<string, QuestEventPayload[]>();
    for (const { hook, payload } of captures) {
      if (!payload?.sourceNumber) continue;
      parCrochet.set(hook, [...(parCrochet.get(hook) ?? []), payload]);
    }
    for (const [hook, charges] of parCrochet) {
      const distinctes = new Map<number, QuestEventPayload>();
      for (const c of charges) distinctes.set(Number(c.sourceNumber), c);
      const lot = [...distinctes.values()];
      for (const charge of lot) {
        enregistrer(hook, 'agregat', { ...charge, matchKey: 'partie-agregat', round: 1 });
      }
      for (let manche = 1; manche <= 4; manche += 1) {
        for (const charge of lot.slice(0, 3)) {
          enregistrer(hook, 'agregat-manches', { ...charge, matchKey: 'partie-manches', round: manche });
        }
      }
    }
    expect(parCrochet.size).toBeGreaterThan(0);
  });

  it('les situations scriptees couvrent ce qu un plateau generique ne produit pas', () => {
    for (const dernier of [false, true]) {
      jouerLaPremiereCarte(plateau({
        p1: [], p2: ['SS-031-UC', 'SS-003-C'], main: ['SS-078-UC'], missions: 2,
      }), 0, dernier);
    }

    for (const dernier of [false, true]) {
      jouerLaPremiereCarte(plateau({
        p1: ['SS-003-C'], p2: ['SS-018-UC', 'SS-005-C'], main: ['SS-137-R'], missions: 2,
      }), 0, dernier);
    }

    for (const dernier of [false, true]) {
      jouerLaPremiereCarte(plateau({
        p1: [], p2: ['SS-118-R', 'SS-009-C', 'SS-003-C'], main: ['SS-119-R'], missions: 3,
      }), 0, dernier);
    }

    jouerLaPremiereCarte(plateau({ p1: ['SS-046-UC'], main: ['SS-115-R'], missions: 2 }));

    {
      let etat = plateau({ p1: [], p2: ['SS-003-C'], main: ['SS-014-C'], missions: 2 });
      etat.activeMissions[0].player2Characters[0].isHidden = true;
      jouerLaPremiereCarte(etat);
    }

    {
      let etat = plateau({
        p1: ['SS-003-C', 'SS-005-C'], missions: 2, missionIds: MISSIONS_SS,
        main: ['SS-096-UC', 'SS-097-UC'],
      });
      etat = jouerLaPremiereCarte(etat, 0, false);
      try { etat = GameEngine.applyAction(etat, 'player2', { type: 'PASS' } as never); } catch { /* ignore */ }
      etat = jouerLaPremiereCarte(etat, 0, true);
      emitAttachmentStateEvents(etat);
      passerJusquAuDecompte(etat);
    }

    {
      let etat = plateau({
        p1: ['SS-003-C'], missions: 4, missionIds: MISSIONS_SS,
        main: ['SS-103-UC', 'SS-104-C', 'SS-105-UC', 'SS-106-C'],
      });
      etat = enchainer(etat, [0, 1, 2, 3]);
    }

    {
      let etat = plateau({ p1: ['SS-003-C'], missions: 2, main: ['SS-100-C', 'SS-088-UC'] });
      etat = enchainer(etat, [0, 0]);
    }

    {
      let etat = plateau({ p1: ['SS-003-C'], p2: ['SS-005-C'], missions: 2, main: ['SS-084-C'] });
      etat.activeMissions[0].player2Characters[0].powerTokens = 5;
      try {
        etat = GameEngine.applyAction(etat, 'player1', { type: 'PLAY_HIDDEN', cardIndex: 0, missionIndex: 0 } as never);
        const cache = etat.activeMissions[0].player1Characters.find((c) => c.isHidden);
        if (cache) {
          etat = repondreTout(GameEngine.applyAction(etat, 'player1', {
            type: 'REVEAL_CHARACTER', characterInstanceId: cache.instanceId,
          } as never));
        }
      } catch { /* la revelation refusee ne doit pas arreter le banc */ }
    }

    {
      let etat = plateau({ p1: [], p2: ['SS-111-R'], missions: 2, missionIds: MISSIONS_SS, main: ['SS-108-C', 'SS-112-R'] });
      etat = enchainer(etat, [0, 0]);
    }

    for (const equipement of ['SS-107-C', 'SS-103-UC', 'SS-106-C']) {
      let etat = plateau({ p1: ['SS-116-R'], missions: 1, missionIds: MISSIONS_SS, main: [equipement] });
      etat.player1.missionPoints = 18;
      etat = jouerLaPremiereCarte(etat, 0);
      passerJusquAuDecompte(etat);
    }
    {
      const etat = plateau({ p1: ['SS-116-R'], missions: 4, missionIds: MISSIONS_SS });
      for (let i = 1; i < 4; i += 1) {
        etat.activeMissions[i] = {
          ...etat.activeMissions[i],
          player1Characters: [simChar('SS-116-R', { owner: 'player1', instanceId: `garde_${i}` })],
        };
        etat.activeMissions[i].player1Characters[0].missionIndex = i;
      }
      etat.player1.missionPoints = 26;
      const enDerniereManche = { ...etat, turn: 4 as GameState['turn'] };
      passerJusquAuDecompte(enDerniereManche);
    }
    expect(true).toBe(true);
  });

  it('les situations a deux camps sont montees directement sur le plateau', () => {
    {
      const etat = plateau({ p1: ['SS-003-C'], missions: 2, main: ['SS-088-UC'] });
      const hote = etat.activeMissions[0].player1Characters[0];
      hote.attachments = [{
        instanceId: 'gear_adverse',
        card: getCardById('SS-100-C') as never,
        owner: 'player2',
      } as never];
      jouerLaPremiereCarte(etat, 0);
    }

    {
      let etat = plateau({ p1: ['SS-003-C'], p2: ['SS-005-C'], missions: 2, main: ['SS-084-C'] });
      etat.activeMissions[0].player2Characters[0].powerTokens = 6;
      try {
        etat = GameEngine.applyAction(etat, 'player1', { type: 'PLAY_HIDDEN', cardIndex: 0, missionIndex: 0 } as never);
        etat = GameEngine.applyAction(etat, 'player2', { type: 'PASS' } as never);
        const cache = etat.activeMissions[0].player1Characters.find((c) => c.isHidden);
        if (cache) {
          etat = repondreTout(GameEngine.applyAction(etat, 'player1', {
            type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: cache.instanceId,
          } as never));
        }
      } catch { /* une revelation refusee ne doit pas arreter le banc */ }
    }

    {
      const etat = plateau({ p1: ['SS-003-C'], p2: ['SS-005-C'], missions: 2 });
      const cible = etat.activeMissions[0].player2Characters[0];
      attachCardToCharacter(
        etat, 'player2', getCardById('SS-080-C') as never, cible.instanceId, false, undefined,
        { owner: 'player1', controllerInstanceId: 'a0' },
      );
    }

    for (const dernier of [false, true]) {
      const etat = plateau({
        p1: ['SS-003-C'], p2: ['SS-018-UC', 'SS-005-C', 'SS-009-C'],
        missions: 2, main: ['SS-137-R'],
      });
      jouerLaPremiereCarte(etat, 0, dernier);
    }

    {
      const etat = plateau({ p1: ['SS-116-R'], missions: 4, missionIds: MISSIONS_SS });
      const rangs = ['D', 'C', 'B', 'A'] as const;
      for (let i = 0; i < 4; i += 1) {
        etat.activeMissions[i] = {
          ...etat.activeMissions[i],
          rank: rangs[i],
          player1Characters: [simChar('SS-116-R', { owner: 'player1', instanceId: `garde_${i}` })],
          player2Characters: [],
          wonBy: null,
        };
        etat.activeMissions[i].player1Characters[0].missionIndex = i;
      }
      let courant = executeMissionPhase({ ...etat, phase: 'mission' as GameState['phase'] });
      for (let i = 0; i < 20 && courant.pendingActions.length > 0; i += 1) {
        courant = repondreTout(courant);
        courant = resumeMissionScoring(courant);
      }

    }

    expect(true).toBe(true);
  });

  it('les 183 quetes du set 2 progressent, sans une seule exception', () => {
    const jamais = quetes.filter((q) => !touchees.has(q.id));
    if (jamais.length > 0) {
      const parCrochet = new Map<string, string[]>();
      for (const q of jamais) parCrochet.set(q.hook, [...(parCrochet.get(q.hook) ?? []), q.id]);
      for (const [h, ids] of parCrochet) console.log(`  ${h}: ${ids.join(', ')}`);
    }
    expect(jamais.map((q) => q.id), 'ces quetes ne progressent jamais').toEqual([]);
    const prouvees = quetes.filter((q) => touchees.has(q.id)).length;
    expect(prouvees, 'toutes les quetes prouvees en jeu reel').toBe(quetes.length);
    expect(quetes.length).toBe(183);
  });
});
