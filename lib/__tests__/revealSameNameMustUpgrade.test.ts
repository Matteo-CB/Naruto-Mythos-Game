import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { validateRevealCharacter } from '@/lib/engine/rules/PlayValidation';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { GameState } from '@/lib/engine/types';

const KANKURO_CHEAP = 'KS-077-C';
const KANKURO_SET2 = 'SS-117-R';

function kankurosOnMissionZero(state: GameState): { name: string; hidden: boolean; stack: number }[] {
  return state.activeMissions[0].player1Characters
    .map((c) => {
      const top = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
      return { name: top.name_fr.toUpperCase(), hidden: c.isHidden, stack: c.stack?.length ?? 1 };
    })
    .filter((c) => c.name.includes('KANKUR'));
}

function boardWithVisibleAndHiddenKankuro(): GameState {
  const state = buildSimState({
    p1: [
      simChar(KANKURO_CHEAP, { owner: 'player1', instanceId: 'kankuro-visible' }),
      simChar(KANKURO_SET2, { owner: 'player1', instanceId: 'kankuro-hidden', hidden: true }),
    ],
    missions: 2,
    chakra1: 30,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  return state;
}

describe('revealing a hidden character never creates a second visible character of the same name', () => {
  it('the board really starts with one visible and one hidden Kankuro', () => {
    const kankuros = kankurosOnMissionZero(boardWithVisibleAndHiddenKankuro());
    expect(kankuros).toHaveLength(2);
    expect(kankuros.filter((k) => !k.hidden)).toHaveLength(1);
  });

  it('the reveal is either an upgrade or refused, never a flat second Kankuro', () => {
    const state = boardWithVisibleAndHiddenKankuro();

    const validation = validateRevealCharacter(state, 'player1', 0, 'kankuro-hidden');

    const after = GameEngine.applyAction(state, 'player1', {
      type: 'REVEAL_CHARACTER',
      missionIndex: 0,
      characterInstanceId: 'kankuro-hidden',
    } as never);

    const visibleKankuros = kankurosOnMissionZero(after).filter((k) => !k.hidden);
    expect(
      visibleKankuros.length,
      `validation said valid=${validation.valid} (${validation.reasonKey ?? validation.reason ?? '-'}), board now: ${JSON.stringify(kankurosOnMissionZero(after))}`,
    ).toBe(1);
  });
});
