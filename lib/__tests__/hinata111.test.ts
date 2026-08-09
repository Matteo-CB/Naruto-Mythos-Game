import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCharacterById } from '@/lib/data/cardIndex';
import type { GameState } from '@/lib/engine/types';
import { buildPromptTag } from '@/lib/effects/promptTag';

const HINATA = 'SS-111-SHINOBIV';
const NEJI_ON_BOARD = 'KS-116-R';
const HINATA_IN_DISCARD = 'KS-030-C';
const NEJI_IN_HAND = 'KS-036-C';
const LOCALES = ['en', 'fr', 'es', 'ja', 'pt', 'it', 'pl'];

function board(opts: { neji?: boolean; discard?: boolean; extraHand?: string[] } = {}): GameState {
  const state = buildSimState({
    missionIds: ['KS-001-MMS', 'KS-006-MMS'],
    hand1: [HINATA, ...(opts.extraHand ?? [])],
    p1: opts.neji === false ? [] : [simChar(NEJI_ON_BOARD, { owner: 'player1', instanceId: 'my-neji' })],
    chakra1: 20,
  });
  if (opts.discard !== false) state.player1.discardPile = [getCharacterById(HINATA_IN_DISCARD)!];
  return state;
}

function playHinata(state: GameState): GameState {
  return GameEngine.applyAction(state, 'player1', {
    type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
  });
}

function answerFirst(state: GameState): GameState {
  const action = state.pendingActions[0];
  return GameEngine.applyAction(state, action.player, {
    type: 'SELECT_TARGET', pendingActionId: action.id, selectedTargets: [action.options[0]],
  });
}

describe('Hinata 111: the DUEL fires and comes before the MAIN, as printed', () => {
  it('a Neji on the mission opens the DUEL window first', () => {
    const played = playHinata(board());

    const prompt = played.pendingActions[0];
    expect(prompt, 'the DUEL asks').toBeTruthy();
    expect(prompt.descriptionKey, 'and it is the DUEL, printed first on the card')
      .toBe('game.effect.desc.ss111ConfirmDuel');
  });

  it('accepting brings the topmost Hinata back to hand, before the MAIN asks what to play', () => {
    const afterDuel = answerFirst(playHinata(board({ extraHand: [NEJI_IN_HAND] })));

    expect(
      afterDuel.player1.hand.some((c) => c.id === HINATA_IN_DISCARD),
      'the discarded Hinata is back in hand',
    ).toBe(true);
    expect(afterDuel.player1.discardPile.length, 'and gone from the discard pile').toBe(0);
    expect(afterDuel.pendingActions[0]?.descriptionKey, 'only then does the MAIN ask')
      .toBe('game.effect.desc.ss111ConfirmMain');
  });

  it('the card taken back by the DUEL can be played by the MAIN of the same turn', () => {
    const afterDuel = answerFirst(playHinata(board()));
    const afterMainConfirm = answerFirst(afterDuel);

    const picker = afterMainConfirm.pendingActions[0];
    expect(picker, 'the MAIN offers a choice').toBeTruthy();
    expect(picker.options.length, 'the Hinata just recovered is a legal choice').toBeGreaterThan(0);
  });

  it('without a Neji in the mission there is no DUEL at all', () => {
    const played = playHinata(board({ neji: false, extraHand: [NEJI_IN_HAND] }));
    expect(
      played.pendingActions.some((a) => a.descriptionKey === 'game.effect.desc.ss111ConfirmDuel'),
      'the DUEL needs its partner on the mission',
    ).toBe(false);
  });

  it('an empty discard pile means the DUEL simply has nothing to take back', () => {
    const played = playHinata(board({ discard: false }));
    expect(
      played.pendingActions.some((a) => a.descriptionKey === 'game.effect.desc.ss111ConfirmDuel'),
    ).toBe(false);
  });
});

describe('Hinata 111 prompt wording', () => {
  it('no prompt types its effect tag, the popup adds it from the effect itself', () => {
    for (const loc of LOCALES) {
      const messages = JSON.parse(readFileSync(`messages/${loc}.json`, 'utf8'));
      const desc = messages.game.effect.desc;
      for (const key of ['ss111ConfirmDuel', 'ss111ConfirmMain', 'ss111PlayHyuga']) {
        expect(desc[key], `${loc} ${key}`).toBeTruthy();
        expect(/^(?:DUEL|MAIN|AMBUSH|UPGRADE|SCORE)[ 　]?[:：]/.test(desc[key]), `${loc} ${key}`).toBe(false);
      }
    }
  });

  it('the DUEL tag is still available, derived from the printed card', () => {
    expect(buildPromptTag('DUEL', 'SS111_CONFIRM_DUEL', getCharacterById(HINATA))).toEqual({
      effectType: 'DUEL', duelPartner: 'Neji Hyuga',
    });
  });

  it('the DUEL rules text starts with DUEL so the engine can read its partner', () => {
    const duel = (getCharacterById(HINATA)!.effects ?? []).find((e) => e.type === 'DUEL')!;
    expect(duel.description.replace(/\[[^\]]*\]/g, '').trim().startsWith('DUEL ')).toBe(true);

    const lee = (getCharacterById('SS-115-SHINOBIV')!.effects ?? []).find((e) => e.type === 'DUEL')!;
    expect(lee.description.replace(/\[[^\]]*\]/g, '').trim().startsWith('DUEL ')).toBe(true);
  });
});
