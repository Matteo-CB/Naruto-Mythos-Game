import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildPendingTargetSelectionUI } from '@/stores/gameStore';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { AttachedCard, GameState } from '@/lib/engine/types';

const HOST = 'KS-009-C';
const HEADBAND = 'SS-092-C';

function attachment(instanceId: string, owner: 'player1' | 'player2'): AttachedCard {
  return { instanceId, card: getCardById(HEADBAND)!, owner };
}

function boardWithAttachment(): GameState {
  const host = simChar(HOST, { owner: 'player2', instanceId: 'enemy-host' });
  const state = buildSimState({
    missionIds: ['SS-010-MMS', 'KS-006-MMS'],
    p1: [simChar(HOST, { owner: 'player1', instanceId: 'my-scorer', powerTokens: 8 })],
    p2: [{ ...host, attachments: [attachment('att-1', 'player2')] }],
  });
  return state;
}

function scoreTheMission(state: GameState): GameState {
  return GameEngine.transitionToMissionPhase(state);
}

describe('Sabotage opens a real, clickable choice', () => {
  it('the prompt is a card list whose options are the attachments themselves', () => {
    const scored = scoreTheMission(boardWithAttachment());

    const confirm = scored.pendingActions[0];
    expect(confirm, 'the optional effect asks first').toBeTruthy();
    const confirmed = GameEngine.applyAction(scored, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: confirm.id, selectedTargets: [confirm.options[0]],
    });

    const choice = confirmed.pendingActions[0];
    expect(choice, 'a second prompt asks which attachment').toBeTruthy();
    expect(choice.type, 'an attachment is not a board character, so it needs a card list').toBe('CHOOSE_CARD_FROM_LIST');
    expect(choice.options, 'the attachment itself is the option').toEqual(['att-1']);

    const effect = confirmed.pendingEffects.find((e) => e.id === choice.sourceEffectId);
    const payload = JSON.parse(effect!.effectDescription);
    expect(payload.attachments, 'the popup gets what it needs to draw the card').toHaveLength(1);
    expect(payload.attachments[0].attachmentId).toBe('att-1');
    expect(payload.attachments[0].image_file, 'the card art is carried through').toBeTruthy();
    expect(payload.attachments[0].name_fr).toBe(getCardById(HEADBAND)!.name_fr);
  });

  it('choosing the attachment discards it to its own owner', () => {
    const scored = scoreTheMission(boardWithAttachment());
    const confirm = scored.pendingActions[0];
    const confirmed = GameEngine.applyAction(scored, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: confirm.id, selectedTargets: [confirm.options[0]],
    });

    const choice = confirmed.pendingActions[0];
    const after = GameEngine.applyAction(confirmed, 'player1', {
      type: 'SELECT_TARGET', pendingActionId: choice.id, selectedTargets: ['att-1'],
    });

    const host = after.activeMissions[0].player2Characters.find((c) => c.instanceId === 'enemy-host');
    expect(host, 'the host stays in play').toBeTruthy();
    expect(host!.attachments ?? [], 'the attachment is gone from the host').toHaveLength(0);
    expect(
      after.player2.discardPile.some((c) => c.id === HEADBAND),
      'it goes to its own owner discard pile, not the scorer',
    ).toBe(true);
    expect(after.player1.discardPile.some((c) => c.id === HEADBAND)).toBe(false);
  });

  it('with no attachment on the board the effect just says so', () => {
    const bare = buildSimState({
      missionIds: ['SS-010-MMS', 'KS-006-MMS'],
      p1: [simChar(HOST, { owner: 'player1', instanceId: 'my-scorer' })],
    });

    const scored = scoreTheMission(bare);
    expect(
      scored.pendingActions.some((a) => a.descriptionKey === 'game.effect.desc.ssMss10DiscardAttachment'),
      'no prompt is opened when nothing can be discarded',
    ).toBe(false);
  });
});

describe('the Sabotage popup itself is clickable, whoever is at the wheel', () => {
  it('builds one clickable card per attachment, carrying the id the engine expects', () => {
    const scored = scoreTheMission(boardWithAttachment());
    const confirm = scored.pendingActions[0];
    const confirmed = GameEngine.applyAction(scored, confirm.player, {
      type: 'SELECT_TARGET', pendingActionId: confirm.id, selectedTargets: [confirm.options[0]],
    });

    const action = confirmed.pendingActions[0];
    const effect = confirmed.pendingEffects.find((e) => e.id === action.sourceEffectId);
    const chosen: string[] = [];

    const popup = buildPendingTargetSelectionUI(
      action,
      effect,
      {
        playerHand: confirmed[action.player].hand ?? [],
        playerDiscard: confirmed[action.player].discardPile ?? [],
        playerDeckSize: confirmed[action.player].deck?.length ?? 0,
        activeMissions: confirmed.activeMissions.map((m) => ({ rank: m.rank })),
      },
      'Player 2',
      (targetId: string) => { chosen.push(targetId); },
      () => {},
    );

    expect(popup.selectionType, 'a list popup, not the board picker').toBe('CHOOSE_FROM_HAND');
    expect(popup.handCards, 'one entry per attachment in play').toHaveLength(1);
    const entry = popup.handCards![0];
    expect(entry.targetId, 'clicking sends the attachment id the engine resolves').toBe('att-1');
    expect(entry.card.name_fr).toBe(getCardById(HEADBAND)!.name_fr);
    expect(entry.card.image_file, 'the popup can draw the real card').toBeTruthy();

    popup.onSelect(entry.targetId!);
    expect(chosen, 'the click reaches the engine with a resolvable id').toEqual(['att-1']);

    const after = GameEngine.applyAction(confirmed, action.player, {
      type: 'SELECT_TARGET', pendingActionId: action.id, selectedTargets: [chosen[0]],
    });
    expect(after.player2.discardPile.some((c) => c.id === HEADBAND), 'and it really discards').toBe(true);
  });
});

describe('Reconnaissance shows the hidden card before offering the move', () => {
  const SCORER = 'KS-009-C';

  function reconBoard(): GameState {
    return buildSimState({
      missionIds: ['SS-002-MMS', 'KS-006-MMS'],
      p1: [simChar(SCORER, { owner: 'player1', instanceId: 'my-scorer', powerTokens: 8 })],
      p2: [simChar('KS-136-S', { owner: 'player2', instanceId: 'enemy-hidden', hidden: true })],
    });
  }

  function answer(state: GameState, targets: string[]): GameState {
    const action = state.pendingActions[0];
    return GameEngine.applyAction(state, action.player, {
      type: 'SELECT_TARGET', pendingActionId: action.id, selectedTargets: targets,
    });
  }

  it('looking comes first, and the card is shown before any move is proposed', () => {
    const scored = GameEngine.transitionToMissionPhase(reconBoard());
    const confirmed = answer(scored, [scored.pendingActions[0].options[0]]);
    const looked = answer(confirmed, ['enemy-hidden']);

    const reveal = looked.pendingActions[0];
    expect(reveal, 'a step exists between picking and moving').toBeTruthy();

    const revealEffect = looked.pendingEffects.find((e) => e.id === reveal.sourceEffectId);
    expect(revealEffect!.targetSelectionType, 'that step is the look').toBe('SSMSS02_LOOK_REVEAL');

    const payload = JSON.parse(revealEffect!.effectDescription);
    expect(payload.cardName, 'the card identity is handed to the popup').toBe(getCardById('KS-136-S')!.name_fr);
    expect(payload.cardImageFile, 'with its art').toBeTruthy();

    const stillThere = looked.activeMissions[0].player2Characters.find((c) => c.instanceId === 'enemy-hidden');
    expect(stillThere, 'nothing moved yet').toBeTruthy();
    expect(stillThere!.isHidden, 'and it stays face down for everyone else').toBe(true);
  });

  it('the move is proposed only after the look is acknowledged, and stays optional', () => {
    const scored = GameEngine.transitionToMissionPhase(reconBoard());
    const confirmed = answer(scored, [scored.pendingActions[0].options[0]]);
    const looked = answer(confirmed, ['enemy-hidden']);
    const afterLook = answer(looked, ['confirm']);

    const moveAction = afterLook.pendingActions[0];
    expect(moveAction, 'now the move is offered').toBeTruthy();
    const moveEffect = afterLook.pendingEffects.find((e) => e.id === moveAction.sourceEffectId);
    expect(moveEffect!.targetSelectionType).toBe('SSMSS02_MOVE_HIDDEN');
    expect(moveEffect!.isOptional, 'you may move them, you are not forced to').toBe(true);

    const moved = answer(afterLook, ['1']);
    expect(
      moved.activeMissions[1].player2Characters.some((c) => c.instanceId === 'enemy-hidden'),
      'choosing a mission actually moves the character',
    ).toBe(true);
  });

  it('the public log never names the card that was looked at', () => {
    const scored = GameEngine.transitionToMissionPhase(reconBoard());
    const confirmed = answer(scored, [scored.pendingActions[0].options[0]]);
    const looked = answer(confirmed, ['enemy-hidden']);

    const entry = looked.log.find((l) => l.messageKey === 'game.log.effect.ssMss02Looked');
    expect(entry, 'the look is logged').toBeTruthy();
    const params = JSON.stringify(entry!.messageParams ?? {});
    expect(params.includes(getCardById('KS-136-S')!.name_fr), 'but the name stays secret').toBe(false);
  });
});
