import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import { getCardById } from '@/lib/data/cardIndex';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { CharacterCard, GameState } from '@/lib/engine/types';

const TAYUYA_4 = 'KS-065-UC';
const TAYUYA_5 = 'KS-125-R';
const KIDOMARU_5 = 'KS-124-R';
const KABUTO = 'KS-053-UC';

function answerAll(state: GameState, limit = 14): { state: GameState; seen: string[] } {
  let s = state;
  const seen: string[] = [];
  for (let guard = 0; guard < limit && s.pendingActions.length > 0; guard += 1) {
    const pa = s.pendingActions[0];
    const pe = s.pendingEffects.find((e) => e.id === pa.sourceEffectId);
    if (pe?.targetSelectionType) seen.push(pe.targetSelectionType);
    if (!pa.options || pa.options.length === 0) break;
    s = GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pa.options[0]] });
  }
  return { state: s, seen };
}

function boardWithKabuto(chakra: number, kidomaruMission: number): GameState {
  const state = buildSimState({
    p1: [simChar(TAYUYA_4, { owner: 'player1', instanceId: 'tay' })],
    p2: [],
    missions: 2,
    chakra1: chakra,
  });
  state.phase = 'action';
  state.activePlayer = 'player1';
  state.player1.chakra = chakra;
  state.activeMissions[kidomaruMission].player1Characters.push(
    simChar(KIDOMARU_5, { owner: 'player1', instanceId: 'kido', hidden: true }),
  );
  state.player1.discardPile = [getCardById(TAYUYA_5) as CharacterCard];
  state.player1.hand = [getCardById(KABUTO) as CharacterCard];
  return state;
}

function playKabuto(state: GameState) {
  return answerAll(GameEngine.applyAction(state, 'player1', {
    type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
  }));
}

function kidomaru(state: GameState) {
  return state.activeMissions.flatMap((m) => m.player1Characters).find((c) => c.instanceId === 'kido');
}

function tayuyaStack(state: GameState): string[] {
  const tay = state.activeMissions.flatMap((m) => m.player1Characters).find((c) => c.instanceId === 'tay');
  return (tay?.stack ?? []).map((c) => c.id);
}

describe('Tayuya 125 upgrade still offers the reduced play when Kabuto pulled her from the discard', () => {
  beforeAll(() => { initializeRegistry(); });

  it('played straight from hand, a hidden Sound Village character is offered', () => {
    const state = buildSimState({
      p1: [
        simChar(TAYUYA_4, { owner: 'player1', instanceId: 'tay' }),
        simChar(KIDOMARU_5, { owner: 'player1', instanceId: 'kido', hidden: true }),
      ],
      p2: [], missions: 2, chakra1: 40,
    });
    state.phase = 'action';
    state.activePlayer = 'player1';
    state.player1.chakra = 40;
    state.player1.hand = [getCardById(TAYUYA_5) as CharacterCard];

    const { state: done, seen } = answerAll(GameEngine.applyAction(state, 'player1', {
      type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
    }));

    expect(seen).toContain('TAYUYA125_CONFIRM_UPGRADE');
    expect(seen).toContain('TAYUYA125_CHOOSE_SOUND');
    expect(kidomaru(done)?.isHidden, 'the hidden Kidomaru must have been revealed').toBe(false);
  });

  it('pulled from the discard by Kabuto, the upgrade effect still fires', () => {
    const { state: done, seen } = playKabuto(boardWithKabuto(40, 0));

    expect(tayuyaStack(done)).toEqual([TAYUYA_4, TAYUYA_5]);
    expect(seen, 'the upgrade must be offered on the Kabuto path too').toContain('TAYUYA125_CONFIRM_UPGRADE');
    expect(seen).toContain('TAYUYA125_CHOOSE_SOUND');
    expect(kidomaru(done)?.isHidden).toBe(false);
  });

  it('the hidden character can sit on another mission', () => {
    const { state: done, seen } = playKabuto(boardWithKabuto(40, 1));
    expect(seen).toContain('TAYUYA125_CHOOSE_SOUND');
    expect(kidomaru(done)?.isHidden).toBe(false);
  });

  it('with exactly enough chakra the reveal is offered and paid', () => {
    const { state: done, seen } = playKabuto(boardWithKabuto(7, 0));
    expect(seen).toContain('TAYUYA125_CHOOSE_SOUND');
    expect(kidomaru(done)?.isHidden).toBe(false);
    expect(done.player1.chakra).toBe(0);
  });

  it('one chakra short, the upgrade lands but nothing can be played, and the log says why', () => {
    const { state: done, seen } = playKabuto(boardWithKabuto(6, 0));

    expect(tayuyaStack(done), 'the upgrade itself still happens').toEqual([TAYUYA_4, TAYUYA_5]);
    expect(seen, 'no choice may be offered that the player cannot pay').not.toContain('TAYUYA125_CHOOSE_SOUND');
    expect(kidomaru(done)?.isHidden).toBe(true);

    const keys = done.log.map((l) => l.messageKey);
    expect(keys, 'the player must be told it was a chakra problem').toContain('game.log.effect.noChakra');
  });
});
