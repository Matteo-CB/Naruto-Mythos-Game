import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCharacterById } from '@/lib/data/cardIndex';
import { discardableSoundFour, soundFourNameOf } from '@/lib/effects/handlers/SS/kimimaro031';
import type { GameState, PendingAction } from '@/lib/engine/types';

const KIMIMARO = 'SS-031-CHIBIV';
const JIROBO = 'KS-057-C';
const TAYUYA = 'KS-064-C';
const KIDOMARU = 'KS-059-C';
const SAKON = 'KS-061-C';
const ALLY = 'KS-009-C';

function board(hand: string[]): GameState {
  const state = buildSimState({
    missionIds: ['KS-001-MMS', 'KS-006-MMS'],
    hand1: [KIMIMARO, ...hand],
    p1: [simChar(ALLY, { owner: 'player1', instanceId: 'my-ally' })],
    chakra1: 20,
  });
  state.player1.deck = Array.from({ length: 8 }, () => getCharacterById(ALLY)!);
  return state;
}

function playKimimaro(state: GameState): GameState {
  return GameEngine.applyAction(state, 'player1', {
    type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
  });
}

function answer(state: GameState, target?: string): GameState {
  const action = state.pendingActions[0];
  return GameEngine.applyAction(state, action.player, {
    type: 'SELECT_TARGET', pendingActionId: action.id, selectedTargets: [target ?? action.options[0]],
  });
}

function decline(state: GameState): GameState {
  const action = state.pendingActions[0];
  const effect = state.pendingEffects.find((e) => e.id === action.sourceEffectId)!;
  return GameEngine.applyAction(state, action.player, {
    type: 'DECLINE_OPTIONAL_EFFECT', pendingEffectId: effect.id,
  });
}

function prompt(state: GameState): PendingAction | undefined {
  return state.pendingActions[0];
}

function kimimaroTokens(state: GameState): number {
  const me = state.activeMissions[0].player1Characters.find((c) => c.card.id === KIMIMARO);
  return me?.powerTokens ?? -1;
}

function handIndexOf(state: GameState, cardId: string): string {
  const index = state.player1.hand.findIndex((c) => c.id === cardId);
  return String(index);
}

describe('Kimimaro 031 reads the Sound Four in hand', () => {
  it('recognises each of the four by name, and nothing else', () => {
    expect(soundFourNameOf(getCharacterById(JIROBO))).toBe('JIROBO');
    expect(soundFourNameOf(getCharacterById(TAYUYA))).toBe('TAYUYA');
    expect(soundFourNameOf(getCharacterById(KIDOMARU))).toBe('KIDOMARU');
    expect(soundFourNameOf(getCharacterById(SAKON))).toBe('SAKON');
    expect(soundFourNameOf(getCharacterById(ALLY)), 'an outsider is not an option').toBeNull();
  });

  it('offers at most one copy of each name', () => {
    const state = buildSimState({ hand1: [JIROBO, JIROBO, TAYUYA] });
    const choices = discardableSoundFour(state, 'player1', []);
    expect(choices.map((c) => c.name).sort()).toEqual(['JIROBO', 'TAYUYA']);
  });

  it('never offers a name already spent this turn', () => {
    const state = buildSimState({ hand1: [JIROBO, TAYUYA] });
    const choices = discardableSoundFour(state, 'player1', ['JIROBO']);
    expect(choices.map((c) => c.name)).toEqual(['TAYUYA']);
  });
});

describe('Kimimaro 031 pays each discard with its own reward', () => {
  it('asks before anything, because the effect is optional', () => {
    const played = playKimimaro(board([JIROBO]));
    expect(prompt(played)?.descriptionKey).toBe('game.effect.desc.ss031ConfirmMain');

    const declined = decline(played);
    expect(declined.player1.hand.some((c) => c.id === JIROBO), 'refusing keeps the card').toBe(true);
    expect(kimimaroTokens(declined), 'and grants nothing').toBe(0);
  });

  it('Jirobo gives POWERUP 3 to Kimimaro', () => {
    const chosen = answer(answer(playKimimaro(board([JIROBO]))));

    expect(chosen.player1.discardPile.some((c) => c.id === JIROBO), 'the card is discarded').toBe(true);
    expect(kimimaroTokens(chosen), 'three power tokens').toBe(3);
  });

  it('Tayuya gives 2 Chakra', () => {
    const start = board([TAYUYA]);
    const before = playKimimaro(start).player1.chakra;
    const chosen = answer(answer(playKimimaro(start)));

    expect(chosen.player1.chakra - before).toBe(2);
  });

  it('Sakon draws 2 cards', () => {
    const start = board([SAKON]);
    const afterPlay = playKimimaro(start);
    const before = afterPlay.player1.hand.length;
    const chosen = answer(answer(afterPlay));

    expect(chosen.player1.hand.length - before, 'two drawn, one discarded').toBe(1);
    expect(chosen.player1.deck.length, 'they really come off the deck').toBe(6);
  });

  it('Kidomaru opens a move, character then destination', () => {
    const afterConfirm = answer(playKimimaro(board([KIDOMARU])));
    const afterDiscard = answer(afterConfirm);

    const movePrompt = prompt(afterDiscard);
    expect(movePrompt?.descriptionKey, 'it asks which ally moves').toBe('game.effect.desc.ss031MoveCharacter');

    const afterChar = answer(afterDiscard, 'my-ally');
    const destPrompt = prompt(afterChar);
    expect(destPrompt?.descriptionKey, 'then where it goes').toBe('game.effect.desc.chooseMissionMove');

    const moved = answer(afterChar, '1');
    expect(
      moved.activeMissions[1].player1Characters.some((c) => c.instanceId === 'my-ally'),
      'the ally really changes mission',
    ).toBe(true);
  });
});

describe('Kimimaro 031 chains its discards, up to one of each', () => {
  it('after one discard it offers the remaining names, and stops when they are spent', () => {
    let state = answer(playKimimaro(board([JIROBO, TAYUYA])));
    state = answer(state, handIndexOf(state, JIROBO));

    expect(prompt(state)?.descriptionKey, 'it comes back for the next one').toBe('game.effect.desc.ss031ChooseDiscard');
    expect(kimimaroTokens(state)).toBe(3);

    const chakraBefore = state.player1.chakra;
    state = answer(state, handIndexOf(state, TAYUYA));

    expect(state.player1.chakra - chakraBefore).toBe(2);
    expect(state.pendingActions.length, 'nothing else to offer').toBe(0);
  });

  it('the player may stop mid chain and keep the rest of the hand', () => {
    let state = answer(playKimimaro(board([JIROBO, TAYUYA])));
    state = answer(state, handIndexOf(state, JIROBO));
    state = decline(state);

    expect(kimimaroTokens(state), 'the first reward stands').toBe(3);
    expect(state.player1.hand.some((c) => c.id === TAYUYA), 'the rest stays in hand').toBe(true);
    expect(state.pendingActions.length).toBe(0);
  });

  it('two copies of the same name only ever pay once', () => {
    let state = answer(playKimimaro(board([JIROBO, JIROBO])));
    state = answer(state, handIndexOf(state, JIROBO));

    expect(kimimaroTokens(state)).toBe(3);
    expect(state.pendingActions.length, 'the second Jirobo is not a second reward').toBe(0);
    expect(state.player1.hand.filter((c) => c.id === JIROBO).length, 'it stays in hand').toBe(1);
  });

  it('with none of the four in hand the card simply says so', () => {
    const played = playKimimaro(board([ALLY]));
    expect(
      played.pendingActions.some((a) => a.descriptionKey === 'game.effect.desc.ss031ConfirmMain'),
      'no window when there is nothing to discard',
    ).toBe(false);
  });
});

describe('Kimimaro SS-031 is never his own friendly character', () => {
  it('the Kidomaru move never offers Kimimaro himself', () => {
    const state = board([KIDOMARU]);
    const played = playKimimaro(state);
    const confirmed = answer(played);
    const discarded = answer(confirmed, handIndexOf(confirmed, KIDOMARU));

    const kimimaro = discarded.activeMissions[0].player1Characters
      .find((c) => c.card.id === KIMIMARO);
    expect(kimimaro, 'he is in play').toBeTruthy();

    const move = prompt(discarded);
    expect(move?.descriptionKey).toBe('game.effect.desc.ss031MoveCharacter');
    expect(move?.options, 'a character is not its own friend').not.toContain(kimimaro!.instanceId);
    expect(move?.options, 'the real ally is offered').toContain('my-ally');
  });

  it('with no other friendly character, no move window opens at all', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [KIMIMARO, KIDOMARU],
      p1: [],
      chakra1: 20,
    });
    state.player1.deck = Array.from({ length: 8 }, () => getCharacterById(ALLY)!);

    const played = playKimimaro(state);
    const confirmed = answer(played);
    const discarded = answer(confirmed, handIndexOf(confirmed, KIDOMARU));

    expect(prompt(discarded), 'nothing to move but himself').toBeFalsy();
  });
});
