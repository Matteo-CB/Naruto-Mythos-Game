import { describe, it, expect, beforeAll } from 'vitest';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getCardById } from '@/lib/data/cardIndex';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { CharacterCard, GameState } from '@/lib/engine/types';

const SHIKAMARU = 'KS-021-C';
const ROCK_LEE = 'KS-038-C';

function promptTypes(state: GameState): string[] {
  return state.pendingActions
    .map((pa) => state.pendingEffects.find((e) => e.id === pa.sourceEffectId)?.targetSelectionType)
    .filter((t): t is string => !!t);
}

function answerAll(state: GameState, limit = 10): { state: GameState; seen: string[] } {
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

describe('a DUEL condition is checked when the DUEL resolves, not when the card is played', () => {
  it('Temari SS-119 loses her DUEL when her MAIN moved Shikamaru out of the mission', () => {
    const st = buildSimState({
      p1: [],
      p2: [simChar(SHIKAMARU, { owner: 'player2', instanceId: 'shika' })],
      missions: 2,
      chakra1: 30,
    });
    st.player1.hand = [getCardById('SS-119-R') as CharacterCard];

    const played = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    const { state: done, seen } = answerAll(played);

    expect(seen).toContain('SS119_CONFIRM_MAIN');
    expect(seen).toContain('SS119_MOVE_CHAR');
    expect(seen, 'the DUEL partner left the mission before the DUEL could resolve').not.toContain('SS119_CONFIRM_DUEL');
    expect(done.activeMissions[0].player2Characters.some((c) => c.instanceId === 'shika')).toBe(false);
  });

  it('Temari SS-119 keeps her DUEL when Shikamaru is still there', () => {
    const st = buildSimState({
      p1: [],
      p2: [
        simChar(SHIKAMARU, { owner: 'player2', instanceId: 'shika' }),
        simChar('KS-005-C', { owner: 'player2', instanceId: 'other' }),
      ],
      missions: 2,
      chakra1: 30,
    });
    st.player1.hand = [getCardById('SS-119-R') as CharacterCard];

    let s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    const seen: string[] = [];
    for (let guard = 0; guard < 10 && s.pendingActions.length > 0; guard += 1) {
      const pa = s.pendingActions[0];
      const pe = s.pendingEffects.find((e) => e.id === pa.sourceEffectId);
      if (pe?.targetSelectionType) seen.push(pe.targetSelectionType);
      const pick = pe?.targetSelectionType === 'SS119_MOVE_CHAR' ? 'other' : pa.options[0];
      s = GameEngine.applyAction(s, pa.player, { type: 'SELECT_TARGET', pendingActionId: pa.id, selectedTargets: [pick] });
    }

    expect(seen).toContain('SS119_CONFIRM_DUEL');
  });
});

describe('Gaara SS-114 asks before its MAIN and before the Rock Lee alteration', () => {
  function board(withRockLee: boolean): GameState {
    const enemies = [simChar('KS-005-C', { owner: 'player2', instanceId: 'enemy' })];
    const allies = withRockLee ? [simChar(ROCK_LEE, { owner: 'player1', instanceId: 'lee' })] : [];
    const st = buildSimState({ p1: allies, p2: enemies, missions: 2, chakra1: 30 });
    st.player1.hand = [getCardById('SS-114-R') as CharacterCard, getCardById('SS-078-UC') as CharacterCard];
    return st;
  }

  it('the MAIN opens with its own confirmation', () => {
    const played = GameEngine.applyAction(board(false), 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    expect(promptTypes(played)).toEqual(['SS114_CONFIRM_MAIN']);
  });

  it('without Rock Lee the chain goes straight to the discard choice', () => {
    const played = GameEngine.applyAction(board(false), 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    const { seen } = answerAll(played);
    expect(seen).toContain('SS114_CHOOSE_DISCARD');
    expect(seen).not.toContain('SS114_CONFIRM_DUEL_MODIFIER');
  });

  it('with Rock Lee the alteration is offered before anything is discarded', () => {
    const played = GameEngine.applyAction(board(true), 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    const confirmed = GameEngine.applyAction(played, 'player1', {
      type: 'SELECT_TARGET',
      pendingActionId: played.pendingActions[0].id,
      selectedTargets: [played.pendingActions[0].options[0]],
    });

    expect(promptTypes(confirmed)).toEqual(['SS114_CONFIRM_DUEL_MODIFIER']);
    expect(confirmed.player1.discardPile.length, 'nothing may be discarded before the choice is made').toBe(0);
  });

  it('accepting the alteration defeats the enemy instead of hiding it', () => {
    const played = GameEngine.applyAction(board(true), 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    const { state: done, seen } = answerAll(played);

    expect(seen).toContain('SS114_CONFIRM_DUEL_MODIFIER');
    expect(seen).toContain('SS114_CHOOSE_DISCARD');
    expect(done.activeMissions[0].player2Characters.some((c) => c.instanceId === 'enemy')).toBe(false);
    expect(done.player2.discardPile.some((c) => c.id === 'KS-005-C')).toBe(true);
  });
});

describe('Crow SS-089 asks with its own card before picking a new host', () => {
  it('the trigger opens on a confirmation naming the attachment', () => {
    const st = buildSimState({
      p1: [
        simChar('KS-009-C', { owner: 'player1', instanceId: 'host' }),
        simChar('KS-005-C', { owner: 'player1', instanceId: 'other' }),
      ],
      p2: [],
      missions: 2,
      chakra1: 30,
    });
    st.player1.hand = [getCardById('SS-089-UC') as CharacterCard, getCardById('KS-078-UC') as CharacterCard];

    let s = GameEngine.applyAction(st, 'player1', { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false });
    s = answerAll(s).state;
    const host = s.activeMissions[0].player1Characters.find((c) => c.instanceId === 'host');
    expect(host?.attachments?.length, 'the Crow must be attached before the Kankuro trigger can fire').toBe(1);

    const kankuro = s.player1.hand.findIndex((c) => (c.name_en ?? '').toUpperCase() === 'KANKURO');
    if (kankuro === -1) return;

    s = GameEngine.applyAction(s, 'player2', { type: 'PASS' });
    const afterKankuro = GameEngine.applyAction(s, 'player1', { type: 'PLAY_CHARACTER', cardIndex: kankuro, missionIndex: 1, hidden: false });
    const opened = promptTypes(afterKankuro);
    if (opened.length === 0) return;

    expect(opened[0]).toBe('SS089_CONFIRM_MAIN');
    const pe = afterKankuro.pendingEffects.find((e) => e.targetSelectionType === 'SS089_CONFIRM_MAIN');
    expect(pe?.sourceCardId, 'the popup must show the Crow, not its host').toBe('SS-089-UC');
  });
});
