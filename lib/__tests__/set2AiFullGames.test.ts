import { describe, it, expect, beforeAll } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { AIPlayer } from '@/lib/ai/AIPlayer';
import { getAllCards } from '@/lib/data/cardLoader';
import type { CharacterCard, GameConfig, GameState, MissionCard } from '@/lib/engine/types';

beforeAll(() => {
  initializeRegistry();
});

const PARTIES = 10;
const TICKS_MAX = 2000;

function cartesDuSet2(): { personnages: CharacterCard[]; missions: MissionCard[] } {
  const toutes = getAllCards() as unknown as Array<{ id: string; card_type: string }>;
  const duSet2 = toutes.filter((c) => String(c.id).startsWith('SS-'));
  return {
    personnages: duSet2.filter((c) => c.card_type === 'character') as unknown as CharacterCard[],
    missions: duSet2.filter((c) => c.card_type === 'mission') as unknown as MissionCard[],
  };
}

function alea(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function config(personnages: CharacterCard[], missions: MissionCard[], graine: number): GameConfig {
  const tirage = alea(graine);
  const melange = <T,>(liste: T[]): T[] => [...liste].sort(() => tirage() - 0.5);
  const joueur = (userId: string, difficulte: 'easy' | 'medium') => ({
    userId,
    isAI: true,
    aiDifficulty: difficulte,
    deck: melange(personnages).slice(0, 30),
    missionCards: melange(missions).slice(0, 3),
  });
  return { player1: joueur('ss-p1', 'easy'), player2: joueur('ss-p2', 'medium') } as unknown as GameConfig;
}

interface Issue {
  phase: string;
  ticks: number;
  attente: number;
  erreur?: string;
}

function jouerUnePartie(personnages: CharacterCard[], missions: MissionCard[], graine: number): Issue {
  let s: GameState = GameEngine.createGame(config(personnages, missions, graine));
  const ia = { player1: new AIPlayer('easy', 'player1'), player2: new AIPlayer('medium', 'player2') };
  let ticks = TICKS_MAX;

  try {
    while (s.phase !== 'gameOver' && ticks-- > 0) {
      let agi = false;
      for (const pid of ['player1', 'player2'] as const) {
        if (GameEngine.getValidActions(s, pid).length === 0) continue;
        const action = ia[pid].getAction(s);
        if (!action) continue;
        s = GameEngine.applyAction(s, pid, action);
        agi = true;
        break;
      }
      if (agi) continue;

      if (s.pendingActions.length === 0 && s.pendingEffects.length === 0
        && (s.phase === 'start' || s.phase === 'mission' || s.phase === 'end')) {
        s = GameEngine.applyAction(s, s.activePlayer ?? 'player1', { type: 'ADVANCE_PHASE' });
        continue;
      }
      break;
    }
  } catch (e) {
    return { phase: s.phase, ticks: TICKS_MAX - ticks, attente: s.pendingActions.length, erreur: String((e as Error).message).slice(0, 120) };
  }

  return { phase: s.phase, ticks: TICKS_MAX - ticks, attente: s.pendingActions.length };
}

describe('l_IA joue des parties entieres avec des decks entierement du set 2', () => {
  it('dix parties vont jusqu_au bout sans plantage ni blocage', () => {
    const { personnages, missions } = cartesDuSet2();
    expect(personnages.length, 'le set 2 a de quoi construire un deck').toBeGreaterThanOrEqual(30);
    expect(missions.length, 'et de quoi choisir des missions').toBeGreaterThanOrEqual(3);

    const echecs: string[] = [];
    for (let i = 0; i < PARTIES; i++) {
      const graine = Math.floor(Math.random() * 0xffffffff);
      const issue = jouerUnePartie(personnages, missions, graine);
      if (issue.erreur) echecs.push(`graine ${graine}: exception ${issue.erreur}`);
      else if (issue.phase !== 'gameOver') {
        echecs.push(`graine ${graine}: bloquee en ${issue.phase} apres ${issue.ticks} tours, ${issue.attente} question(s) en attente`);
      }
    }
    expect(echecs, 'aucune partie ne plante ni ne se bloque').toEqual([]);
  }, 600_000);
});
