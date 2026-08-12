import { describe, it, expect, beforeAll } from 'vitest';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCharacterById } from '@/lib/data/cardIndex';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import type { CharacterCard, GameState } from '@/lib/engine/types';
import { formatCardLabelShort } from '@/lib/variants/cardLabel';

beforeAll(() => { registerAllSetHandlers(); });

function board(oppHand: string[]): GameState {
  const st = buildSimState({
    hand1: ['SS-044-UC'],
    p1: [simChar('KS-072-C', { owner: 'player1', instanceId: 'kin-base' })],
    p2: [simChar('KS-017-C', { owner: 'player2', instanceId: 'enemy-0' })],
    chakra1: 20,
  });
  st.player2.hand = oppHand.map((id) => getCharacterById(id) as CharacterCard).filter(Boolean);
  return st;
}

const UPGRADE = { type: 'UPGRADE_CHARACTER' as const, cardIndex: 0, missionIndex: 0, targetInstanceId: 'kin-base' };

describe('SS-044 Kin Tsuchi UPGRADE', () => {
  it('discards exactly one random card and logs the full label', () => {
    const st = board(['KS-021-C', 'KS-011-C', 'KS-007-C']);
    const next = GameEngine.applyAction(st, 'player1', UPGRADE);
    expect(next.pendingActions.length).toBe(0);
    expect(next.player2.hand.length).toBe(2);
    expect(next.player2.discardPile.length).toBe(1);
    const entry = next.log.find((l) => l.messageKey === 'game.log.effect.ss044Discard');
    expect(entry).toBeTruthy();
    const attendu = formatCardLabelShort(next.player2.discardPile[0], 'fr');
    expect(entry?.messageParams?.target).toBe(attendu);
    expect(entry?.messageParams?.targetId).toBe(next.player2.discardPile[0].id);
    console.log('LOG TARGET', entry?.messageParams);
  });

  it('is deterministic across identical states', () => {
    const a = GameEngine.applyAction(board(['KS-021-C', 'KS-011-C', 'KS-007-C']), 'player1', UPGRADE);
    const b = GameEngine.applyAction(board(['KS-021-C', 'KS-011-C', 'KS-007-C']), 'player1', UPGRADE);
    expect(a.player2.discardPile[0].id).toBe(b.player2.discardPile[0].id);
  });

  it('logs a refusal when the opponent hand is empty', () => {
    const st = board([]);
    const chakraBefore = st.player1.chakra;
    const next = GameEngine.applyAction(st, 'player1', UPGRADE);
    expect(next.player2.hand.length).toBe(0);
    expect(next.player2.discardPile.length).toBe(0);
    expect(next.log.some((l) => l.messageKey === 'game.log.effect.ss044EmptyHand')).toBe(true);
    expect(chakraBefore - next.player1.chakra).toBe(3);
  });
});
