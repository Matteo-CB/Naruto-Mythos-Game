import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { GameState } from '@/lib/engine/types';

void EffectEngine;

const PROFIL_BAS = 'SS-006-MMS';
const AUTRE_MISSION = 'SS-005-MMS';
const BASSE = 'SS-003-C';
const HAUTE = 'KS-005-C';

function repondreAuxQuestions(state: GameState): GameState {
  let courant = state;
  let garde = 0;
  while (courant.pendingActions.length > 0 && garde < 12) {
    const question = courant.pendingActions[0];
    courant = GameEngine.applyAction(courant, question.player, {
      type: 'SELECT_TARGET',
      pendingActionId: question.id,
      selectedTargets: [question.options[0]],
    } as never);
    garde += 1;
  }
  return courant;
}

function plateau(missionId: string): GameState {
  const state = buildSimState({
    p1: [
      simChar(BASSE, { owner: 'player1', instanceId: 'shizune' }),
      simChar(HAUTE, { owner: 'player1', instanceId: 'cachee', hidden: true }),
    ],
    missions: 2,
    missionIds: [missionId, AUTRE_MISSION],
    chakra1: 40,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  return state;
}

function jetonsDe(state: GameState, instanceId: string): number {
  const char = state.activeMissions[0].player1Characters.find((c) => c.instanceId === instanceId);
  if (!char) throw new Error('personnage introuvable');
  return char.powerTokens;
}

function revelerEnAmelioration(state: GameState): GameState {
  return repondreAuxQuestions(GameEngine.applyAction(state, 'player1', {
    type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'cachee',
  } as never));
}

describe('Faire profil bas accorde son embuscade aussi sur une revelation en amelioration', () => {
  it('la revelation fusionne bien en amelioration', () => {
    const apres = revelerEnAmelioration(plateau(PROFIL_BAS));
    const survivant = apres.activeMissions[0].player1Characters.find((c) => c.instanceId === 'shizune');
    expect(survivant!.stack.map((c) => c.id), 'la carte revelee coiffe la pile').toEqual([BASSE, HAUTE]);
    expect(
      apres.activeMissions[0].player1Characters.some((c) => c.instanceId === 'cachee'),
      'la carte cachee ne subsiste pas a part',
    ).toBe(false);
  });

  it('le personnage ameliore recoit les 2 jetons de la mission', () => {
    const apres = revelerEnAmelioration(plateau(PROFIL_BAS));
    expect(jetonsDe(apres, 'shizune'), 'POWERUP 2 accorde par la mission').toBe(2);
  });

  it('sans la mission, aucun jeton n_est accorde', () => {
    const apres = revelerEnAmelioration(plateau(AUTRE_MISSION));
    expect(jetonsDe(apres, 'shizune'), 'la prime vient bien de la mission').toBe(0);
  });
});
