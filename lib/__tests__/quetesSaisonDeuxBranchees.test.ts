import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import { getCardById } from '@/lib/data/cardIndex';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { onQuestEvent, clearQuestListeners, type QuestEventPayload } from '@/lib/quests/hooks';
import { QUESTS, questsOfSeason, SAISON_COURANTE } from '@/lib/quests/questData';
import { matchQuestsForEvent } from '@/lib/quests/trackProgress';
import { TOUTES_LES_CLES } from '@/lib/quests/predicateKeys';
import type { GameState } from '@/lib/engine/types';

const RACINE = process.cwd();

beforeAll(() => {
  initializeRegistry();
});

interface Signal { hook: string; payload?: QuestEventPayload }

let recu: Signal[] = [];

beforeEach(() => {
  recu = [];
  clearQuestListeners();
  onQuestEvent((hook, _userId, payload) => { recu.push({ hook, payload }); });
});

afterEach(() => {
  clearQuestListeners();
});

const quetesSS = () => questsOfSeason(SAISON_COURANTE);

function plateau(p1: string[], p2: string[], main: string[] = []): GameState {
  const s = buildSimState({
    p1: p1.map((id, i) => simChar(id, { owner: 'player1', instanceId: `p1_${i}` })),
    p2: p2.map((id, i) => simChar(id, { owner: 'player2', instanceId: `p2_${i}` })),
    missions: 2,
    chakra1: 40,
    edgeHolder: 'player1',
  });
  s.player1UserId = 'joueur-un';
  s.player2UserId = 'joueur-deux';
  s.gameId = 'partie-test';
  s.gameMode = 'casual';
  s.player1.hand = main.map((id) => getCardById(id) as never);
  return s;
}

function repondreTout(depart: GameState): GameState {
  let courant = depart;
  let garde = 0;
  while (courant.pendingActions.length > 0 && garde < 20) {
    const q = courant.pendingActions[0];
    const choix = q.options?.[0];
    courant = GameEngine.applyAction(courant, q.player, choix
      ? { type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [choix] } as never
      : { type: 'DECLINE_OPTIONAL_EFFECT', pendingActionId: q.id } as never);
    garde += 1;
  }
  return courant;
}

describe('la saison Shinobi Shiren est reellement branchee', () => {
  it('chaque quete annonce un crochet, une portee et un filtre connus', () => {
    for (const q of quetesSS()) {
      expect(q.hook, q.id).toBeTruthy();
      expect(['cumulative', 'match', 'session'], q.id).toContain(q.scope);
      for (const cle of Object.keys(q.predicate ?? {})) {
        expect(TOUTES_LES_CLES.has(cle), `${q.id} utilise la cle inconnue ${cle}`).toBe(true);
      }
    }
  });

  it('chaque crochet utilise est emis quelque part dans le code', () => {
    const sources = [
      'lib/quests/effetResolu.ts', 'lib/quests/engineEmit.ts', 'lib/quests/etatDeJeu.ts',
      'lib/quests/equipementPose.ts', 'lib/quests/jetonsRetires.ts',
      'lib/quests/missionRemportee.ts', 'lib/quests/resumeDeDeck.ts',
      'lib/effects/EffectEngine.ts', 'lib/effects/attachments.ts', 'lib/effects/defeatUtils.ts',
      'lib/engine/GameEngine.ts', 'lib/engine/phases/MissionPhase.ts', 'lib/socket/server.ts',
      'lib/socket/tournamentHandlers.ts', 'lib/engine/phases/ActionPhase.ts',
    ].map((f) => { try { return readFileSync(join(RACINE, f), 'utf8'); } catch { return ''; } }).join('\n');
    const manquants = [...new Set(quetesSS().map((q) => q.hook))].filter((h) => !sources.includes(h));
    expect(manquants, 'crochets declares mais jamais emis').toEqual([]);
  });

  it('un DUEL resolu annonce sa source, son set et sa manche', () => {
    const depart = plateau([], ['SS-111-R'], ['SS-112-R']);
    repondreTout(GameEngine.applyAction(depart, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0,
    } as never));
    const duel = recu.find((s) => s.hook === 'duel.triggered.with.source');
    expect(duel, 'aucun signal de DUEL').toBeDefined();
    expect(duel!.payload?.set).toBe('SS');
    expect(duel!.payload?.sourceNumber).toBe(112);
    expect(typeof duel!.payload?.round).toBe('number');
  });

  it('le signal de DUEL fait avancer la quete de cette carte, et elle seule', () => {
    const depart = plateau([], ['SS-111-R'], ['SS-112-R']);
    repondreTout(GameEngine.applyAction(depart, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0,
    } as never));
    const duel = recu.find((s) => s.hook === 'duel.triggered.with.source')!;
    const touchees = matchQuestsForEvent(duel.hook, duel.payload).map((m) => m.quest.id);
    expect(touchees).toContain('ss-duel-112');
    expect(touchees).not.toContain('ss-duel-111');
  });

  it('une FIRST STRIKE resolue annonce sa source et son set', () => {
    const depart = plateau([], [], ['SS-021-C']);
    repondreTout(GameEngine.applyAction(depart, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0,
    } as never));
    const fs = recu.find((s) => s.hook === 'first_strike.used.with.source');
    expect(fs, 'aucun signal de FIRST STRIKE').toBeDefined();
    expect(fs!.payload?.set).toBe('SS');
    expect(fs!.payload?.sourceNumber).toBe(21);
  });

  it('aucun handler d effet n est appele hors du point de passage unique', () => {
    const moteur = readFileSync(join(RACINE, 'lib/effects/EffectEngine.ts'), 'utf8');
    expect(moteur).not.toMatch(/envelopperResultat\(\s*handler\(ctx\)/);
    expect(moteur).not.toMatch(/=\s*duelHandler\(ctx\)/);
    expect(moteur).toContain('resoudreEffetAvecQuete');
  });

  it('ne reutilise aucun identifiant entre les deux saisons', () => {
    const ids = QUESTS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
