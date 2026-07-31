import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CharacterCard, GameState } from '@/lib/engine/types';

const GAARA_RARE = 'SS-114-R';
const ROCK_LEE = 'KS-038-C';
const SPARE_GAARA = 'KS-074-C';

function boardWithGaaraRare(withRockLee: boolean): GameState {
  const p1 = withRockLee ? [simChar(ROCK_LEE, { owner: 'player1', instanceId: 'lee' })] : [];

  const state = buildSimState({
    p1,
    p2: [
      simChar('KS-001-C', { owner: 'player2', instanceId: 'enemy-hidden', hidden: true }),
      simChar('KS-021-C', { owner: 'player2', instanceId: 'enemy-visible' }),
    ],
    missions: 2,
    chakra1: 30,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  state.player1.hand = [getCardById(GAARA_RARE) as CharacterCard, getCardById(SPARE_GAARA) as CharacterCard];
  return state;
}

function answerCurrentPrompt(state: GameState, pick?: string): GameState {
  const pending = state.pendingActions.find((a) => a.player === 'player1');
  if (!pending) throw new Error('a prompt should be open');
  return GameEngine.applyAction(state, 'player1', {
    type: 'SELECT_TARGET',
    pendingActionId: pending.id,
    selectedTargets: [pick ?? pending.options[0]],
  } as never);
}

function currentSelectionType(state: GameState): string | undefined {
  const pending = state.pendingActions.find((a) => a.player === 'player1');
  if (!pending) return undefined;
  return state.pendingEffects.find((e) => e.id === pending.sourceEffectId)?.targetSelectionType;
}

function targetsAfterDiscardingGaara(state: GameState): string[] {
  let s = state;
  for (let guard = 0; guard < 6; guard += 1) {
    const type = currentSelectionType(s);
    if (type === undefined) return [];
    if (type === 'SS114_CHOOSE_HIDE') break;
    s = answerCurrentPrompt(s, type === 'SS114_CHOOSE_DISCARD' ? '0' : undefined);
  }
  const pending = s.pendingActions.find((a) => a.player === 'player1');
  return pending?.options ?? [];
}

function openTheEffect(withRockLee: boolean): GameState {
  const state = boardWithGaaraRare(withRockLee);
  return GameEngine.applyAction(state, 'player1', {
    type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
  } as never);
}

describe('Gaara SS-114 (rare) targets depend on hide versus defeat', () => {
  it('the rock lee fixture really is Rock Lee', () => {
    const lee = getCardById(ROCK_LEE) as CharacterCard;
    expect(lee?.name_fr?.toUpperCase()).toContain('LEE');
    expect((getCardById(SPARE_GAARA) as CharacterCard).name_fr.toUpperCase()).toBe('GAARA');
  });

  it('without the duel it hides, so a hidden enemy is not offered', () => {
    const played = openTheEffect(false);
    const targets = targetsAfterDiscardingGaara(played);
    expect(targets, 'hiding an already hidden character is redundant').not.toContain('enemy-hidden');
    expect(targets).toContain('enemy-visible');
  });

  it('with Rock Lee the duel turns it into a defeat, so a hidden enemy is offered', () => {
    const played = openTheEffect(true);
    const targets = targetsAfterDiscardingGaara(played);
    expect(targets, 'a defeat can hit a hidden character').toContain('enemy-hidden');
  });
});
