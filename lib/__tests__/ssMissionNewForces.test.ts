import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { playedNameIsUniqueInMission } from '@/lib/effects/missions/ssMissions';
import { getCharacterById } from '@/lib/data/cardIndex';
import type { GameState } from '@/lib/engine/types';

const GAARA_SMALL = 'KS-074-C';
const GAARA_BIG = 'KS-120-R';
const ICHIBI = 'KS-076-UC';
const SAKURA = 'KS-009-C';

function newForcesBoard(opts: Parameters<typeof buildSimState>[0] = {}): GameState {
  return buildSimState({ ...opts, missionIds: ['SS-001-MMS', 'KS-006-MMS'], chakra1: 20 });
}

function playFromHand(state: GameState, handIndex: number): GameState {
  return GameEngine.applyAction(state, 'player1', {
    type: 'PLAY_CHARACTER', cardIndex: handIndex, missionIndex: 0, hidden: false,
  });
}

function tokensOf(state: GameState, instanceId: string): number {
  for (const mission of state.activeMissions) {
    for (const char of [...mission.player1Characters, ...mission.player2Characters]) {
      if (char.instanceId === instanceId) return char.powerTokens;
    }
  }
  return -1;
}

function playedChar(state: GameState, cardId: string) {
  return state.activeMissions[0].player1Characters.find((c) => c.card.id === cardId);
}

describe('New Forces: the played name is compared to the mission as it was before the play', () => {
  it('the first card played in the mission gets POWERUP 2', () => {
    const before = newForcesBoard({ hand1: [SAKURA] });
    const after = playFromHand(before, 0);

    const played = playedChar(after, SAKURA);
    expect(played, 'the card landed').toBeTruthy();
    expect(played!.powerTokens, 'nothing was there, so the name is new').toBe(2);
  });

  it('a different name next to an existing character still gets POWERUP 2', () => {
    const before = newForcesBoard({
      hand1: [SAKURA],
      p1: [simChar(GAARA_SMALL, { owner: 'player1', instanceId: 'ally-gaara' })],
    });
    const after = playFromHand(before, 0);

    expect(playedChar(after, SAKURA)!.powerTokens).toBe(2);
    expect(tokensOf(after, 'ally-gaara'), 'only the played character is powered up').toBe(0);
  });

  it('no POWERUP when the opponent already has that name in the mission', () => {
    const before = newForcesBoard({
      hand1: [GAARA_SMALL],
      p2: [simChar(GAARA_BIG, { owner: 'player2', instanceId: 'enemy-gaara' })],
    });
    const after = playFromHand(before, 0);

    const played = playedChar(after, GAARA_SMALL);
    expect(played, 'the play is legal, only the bonus is denied').toBeTruthy();
    expect(played!.powerTokens, 'that name was already here').toBe(0);
  });

  it('a hidden enemy does not deny the bonus, because a face-down card shows no name', () => {
    const before = newForcesBoard({
      hand1: [GAARA_SMALL],
      p2: [simChar(GAARA_BIG, { owner: 'player2', instanceId: 'enemy-hidden', hidden: true })],
    });
    const after = playFromHand(before, 0);

    expect(playedChar(after, GAARA_SMALL)!.powerTokens).toBe(2);
  });

  it('upgrading a character with the same name gets nothing', () => {
    const base = simChar(GAARA_SMALL, { owner: 'player1', instanceId: 'my-gaara' });
    const upgraded = {
      ...base,
      card: getCharacterById(GAARA_BIG)!,
      stack: [getCharacterById(GAARA_SMALL)!, getCharacterById(GAARA_BIG)!],
    };
    const state = newForcesBoard({ p1: [upgraded] });

    expect(
      playedNameIsUniqueInMission(state.activeMissions[0], 'my-gaara'),
      'the upgraded card covers a character of the same name',
    ).toBe(false);
  });

  it('upgrading Gaara with Ichibi gets POWERUP 2 when no Ichibi is in the mission', () => {
    const base = simChar(GAARA_SMALL, { owner: 'player1', instanceId: 'my-gaara' });
    const upgraded = {
      ...base,
      card: getCharacterById(ICHIBI)!,
      stack: [getCharacterById(GAARA_SMALL)!, getCharacterById(ICHIBI)!],
    };
    const state = newForcesBoard({ p1: [upgraded] });

    expect(
      playedNameIsUniqueInMission(state.activeMissions[0], 'my-gaara'),
      'Ichibi is a name this mission had never seen',
    ).toBe(true);
  });

  it('upgrading Gaara with Ichibi gets nothing when another Ichibi already stands there', () => {
    const base = simChar(GAARA_SMALL, { owner: 'player1', instanceId: 'my-gaara' });
    const upgraded = {
      ...base,
      card: getCharacterById(ICHIBI)!,
      stack: [getCharacterById(GAARA_SMALL)!, getCharacterById(ICHIBI)!],
    };
    const state = newForcesBoard({
      p1: [upgraded],
      p2: [simChar(ICHIBI, { owner: 'player2', instanceId: 'enemy-ichibi' })],
    });

    expect(playedNameIsUniqueInMission(state.activeMissions[0], 'my-gaara')).toBe(false);
  });

  it('the bonus lands on the mission carrying New Forces, not on another mission', () => {
    const before = newForcesBoard({ hand1: [SAKURA] });
    const elsewhere = GameEngine.applyAction(before, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 1, hidden: false,
    });

    const played = elsewhere.activeMissions[1].player1Characters.find((c) => c.card.id === SAKURA);
    expect(played, 'the card landed on the other mission').toBeTruthy();
    expect(played!.powerTokens, 'the other mission has no New Forces').toBe(0);
  });
});
