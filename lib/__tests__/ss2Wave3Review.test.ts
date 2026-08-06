import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCharacterById } from '@/lib/data/cardIndex';
import { buildPendingTargetSelectionUI } from '@/stores/gameStore';
import { aiSelectTarget } from '@/lib/ai/targetSelection';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import type { GameState, PendingAction } from '@/lib/engine/types';

const TSUNADE = 'SS-002-UC';
const ITACHI = 'SS-053-C';
const KAKASHI_TEAM7 = 'SS-008-C';
const SENBON = 'SS-079-C';
const CHEAP = 'KS-005-C';
const BIG = 'KS-136-S';
const TAYUYA_TAX = 'KS-125-R';
const NARUTO_TEAM7 = 'KS-108-R';

function popupFor(state: GameState) {
  const action = state.pendingActions[0];
  const effect = state.pendingEffects.find((e) => e.id === action.sourceEffectId);
  return buildPendingTargetSelectionUI(
    action,
    effect,
    {
      playerHand: state[action.player].hand ?? [],
      playerDiscard: state[action.player].discardPile ?? [],
      playerDeckSize: state[action.player].deck?.length ?? 0,
      activeMissions: state.activeMissions.map((m) => ({ rank: m.rank })),
    },
    'Player 1',
    () => {},
    () => {},
  );
}

function answer(state: GameState, target?: string): GameState {
  const action = state.pendingActions[0];
  return GameEngine.applyAction(state, action.player, {
    type: 'SELECT_TARGET', pendingActionId: action.id, selectedTargets: [target ?? action.options[0]],
  });
}

function playFirst(state: GameState): GameState {
  return GameEngine.applyAction(state, 'player1', {
    type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
  });
}

describe('every step of the Tsunade gamble reaches the player', () => {
  function board(): GameState {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [TSUNADE], chakra1: 20,
    });
    state.player1.deck = [getCharacterById(BIG)!, getCharacterById(CHEAP)!];
    return state;
  }

  it('the number entry is its own popup, not the board picker', () => {
    const declaring = answer(playFirst(board()));
    const popup = popupFor(declaring);

    expect(popup.selectionType).toBe('DECLARE_NUMBER');
    expect(popup.numberRange).toEqual({ min: 0, max: 999 });
  });

  it('the reveal step shows the revealed card and can be confirmed', () => {
    const revealing = answer(answer(playFirst(board())), '4');
    const popup = popupFor(revealing);

    expect(popup.selectionType, 'a board picker here would be unclickable').toBe('INFO_REVEAL');
    expect(popup.revealedCard?.name_fr, 'the top card is shown').toBeTruthy();
    expect(popup.revealedCard?.revealTitleKey).toBe('game.effect.ss002RevealTitle');
    expect(popup.revealedCard?.revealResultKey).toBe('game.effect.ss002RevealWonResult');
  });

  it('a losing bet still shows the card, with the losing line', () => {
    const state = buildSimState({ missionIds: ['KS-001-MMS', 'KS-006-MMS'], hand1: [TSUNADE], chakra1: 20 });
    state.player1.deck = [getCharacterById(CHEAP)!, getCharacterById(BIG)!];

    const revealing = answer(answer(playFirst(state)), '8');
    expect(popupFor(revealing).revealedCard?.revealResultKey).toBe('game.effect.ss002RevealLostResult');
  });
});

describe('the AI never hides its own side when Itachi forces the choice', () => {
  it('it picks the enemy over its own stronger character', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [ITACHI],
      p1: [simChar(CHEAP, { owner: 'player1', instanceId: 'my-cheap', powerTokens: 5 })],
      p2: [simChar(CHEAP, { owner: 'player2', instanceId: 'foe-cheap' })],
      chakra1: 20,
    });
    const played = playFirst(state);
    const action = played.pendingActions[0] as PendingAction;

    for (const difficulty of ['medium', 'hard', 'impossible'] as const) {
      const chosen = aiSelectTarget(action.options, action, played, 'player1', difficulty);
      expect(chosen, `${difficulty} must not hide its own character`).toBe('foe-cheap');
    }
  });

  it('with only friendly targets it hides the weakest one', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [ITACHI],
      p1: [
        simChar(CHEAP, { owner: 'player1', instanceId: 'strong-ally', powerTokens: 4 }),
        simChar(CHEAP, { owner: 'player1', instanceId: 'weak-ally' }),
      ],
      chakra1: 20,
    });
    const played = playFirst(state);
    const action = played.pendingActions[0] as PendingAction;
    const chosen = aiSelectTarget(action.options, action, played, 'player1', 'hard');

    expect(['weak-ally', action.options.find((o) => o !== 'strong-ally' && o !== 'weak-ally')])
      .toContain(chosen);
    expect(chosen).not.toBe('strong-ally');
  });
});

describe('a reduced reveal is billed at the real cost, not the printed one', () => {
  it('an enemy tax on this mission is paid, not ignored', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [KAKASHI_TEAM7],
      p1: [simChar(NARUTO_TEAM7, { owner: 'player1', instanceId: 'hidden-naruto', hidden: true })],
      p2: [simChar(TAYUYA_TAX, { owner: 'player2', instanceId: 'taxer' })],
      chakra1: 20,
    });

    const naruto = getCharacterById(NARUTO_TEAM7)!;
    const kakashiCost = calculateEffectiveCost(state, 'player1', getCharacterById(KAKASHI_TEAM7)!, 0, false);
    const played = playFirst(state);
    const chakraAfterKakashi = played.player1.chakra;

    const taxedReveal = calculateEffectiveCost(played, 'player1', naruto, 0, true);
    expect(taxedReveal, 'the enemy makes reveals cost more here').toBeGreaterThan(naruto.chakra ?? 0);

    const offered = answer(played);
    const hiddenOption = (offered.pendingActions[0]?.options ?? []).find((o) => o.startsWith('HIDDEN_'));
    expect(hiddenOption, 'the hidden Team 7 ally is offered').toBeTruthy();

    const revealed = answer(offered, hiddenOption);
    expect(revealed.player1.chakra, 'the tax is charged')
      .toBe(chakraAfterKakashi - Math.max(0, taxedReveal - 2));
    expect(state.player1.chakra - kakashiCost).toBe(chakraAfterKakashi);
  });
});

describe('an attachment follows its character through a reveal that upgrades', () => {
  it('the Senbon is still there after the hidden host merges into a stack', () => {
    const state = buildSimState({
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      hand1: [SENBON],
      p1: [
        simChar('KS-010-C', { owner: 'player1', instanceId: 'visible-naruto' }),
        simChar(NARUTO_TEAM7, { owner: 'player1', instanceId: 'hidden-naruto', hidden: true }),
      ],
      chakra1: 20,
    });

    const chosen = answer(playFirst(state), 'hidden-naruto');
    const attached = chosen.pendingActions.length > 0 ? answer(chosen) : chosen;
    const host = attached.activeMissions[0].player1Characters.find((c) => c.instanceId === 'hidden-naruto');
    expect(host?.attachments?.length, 'the Senbon sits on the hidden host').toBe(1);

    const backToMe = GameEngine.applyAction(attached, 'player2', { type: 'PASS' });
    const revealed = GameEngine.applyAction(backToMe, 'player1', {
      type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'hidden-naruto',
      upgradeTargetInstanceId: 'visible-naruto',
    });

    const merged = revealed.activeMissions[0].player1Characters
      .find((c) => c.instanceId === 'visible-naruto');
    expect(merged, 'the stack exists').toBeTruthy();
    expect(merged!.stack.length, 'both cards are in the stack').toBeGreaterThan(1);
    expect(merged!.attachments?.length, 'the weapon rode along').toBe(1);
    expect(revealed.player1.discardPile.some((c) => c.id === SENBON), 'it was not discarded').toBe(false);
  });
});

describe('the board draws an attachment even when its host is face down', () => {
  const LANE = readFileSync('components/game/MissionLane.tsx', 'utf8');

  it('the render is no longer gated on the host being face up', () => {
    expect(LANE).toContain('{(character.attachments ?? []).map((att, attIndex) => {');
    expect(LANE, 'and the layout keeps room for it').toContain('const visible = character.attachments ?? [];');
  });
});
