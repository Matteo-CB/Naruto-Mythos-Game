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

function melange<T>(liste: T[]): T[] {
  return [...liste].sort(() => Math.random() - 0.5);
}

function config(personnages: CharacterCard[], missions: MissionCard[]): GameConfig {
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

function jouerUnePartie(personnages: CharacterCard[], missions: MissionCard[]): Issue {
  let s: GameState = GameEngine.createGame(config(personnages, missions));
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
      const issue = jouerUnePartie(personnages, missions);
      if (issue.erreur) echecs.push(`partie ${i + 1}: exception ${issue.erreur}`);
      else if (issue.phase !== 'gameOver') {
        echecs.push(`partie ${i + 1}: bloquee en ${issue.phase} apres ${issue.ticks} tours, ${issue.attente} question(s) en attente`);
      }
    }
    expect(echecs, 'aucune partie ne plante ni ne se bloque').toEqual([]);
  }, 600_000);
});
