import { describe, it, expect } from 'vitest';
import { NeuralISMCTS } from '@/lib/ai/neural/NeuralISMCTS';
import { AIPlayer } from '@/lib/ai/AIPlayer';
import { BoardEvaluator } from '@/lib/ai/evaluation/BoardEvaluator';
import { createActionPhaseState, mockCharacter } from './testHelpers';
import type { GameState } from '@/lib/engine/types';

type Determinizer = { determinize: (s: GameState, p: 'player1' | 'player2') => GameState };

describe('probe determinize', () => {
  it('shows deck handling with a non-empty opponent hand', () => {
    const base = createActionPhaseState({ activePlayer: 'player2' });
    const sanitized = AIPlayer.sanitizeStateForAI(base, 'player2');
    const mcts = new NeuralISMCTS({ simulations: 1, maxDepth: 1, explorationC: 1, evaluator: null, maxBranching: 4, useBatchedEval: false });
    const d = (mcts as unknown as Determinizer).determinize(sanitized, 'player2');
    console.log('handIds', d.player1.hand.map((c) => c.id));
    console.log('deckOrderSame', d.player1.deck.map((c) => c.id).join(',') === base.player1.deck.map((c) => c.id).join(','));
    expect(d.player1.hand.length).toBeGreaterThan(0);
  });

  it('shows deck handling with an EMPTY opponent hand', () => {
    const base = createActionPhaseState({ activePlayer: 'player2' });
    const emptyHand: GameState = { ...base, player1: { ...base.player1, hand: [] } };
    const sanitized = AIPlayer.sanitizeStateForAI(emptyHand, 'player2');
    const mcts = new NeuralISMCTS({ simulations: 1, maxDepth: 1, explorationC: 1, evaluator: null, maxBranching: 4, useBatchedEval: false });
    const d = (mcts as unknown as Determinizer).determinize(sanitized, 'player2');
    const same = d.player1.deck.map((c) => c.id).join(',') === base.player1.deck.map((c) => c.id).join(',');
    console.log('EMPTY hand -> deck order identical to real deck?', same);
    expect(d.player1.hand.length).toBe(0);
  });

  it('board evaluator placeholder guard', () => {
    const base = createActionPhaseState({ activePlayer: 'player2' });
    const withMarked: GameState = {
      ...base,
      player1: { ...base.player1, hand: [mockCharacter({ id: 'MARK-1', chakra: 9, power: 9 })] },
    };
    const sanitized = AIPlayer.sanitizeStateForAI(withMarked, 'player2');
    console.log('handQuality sanitized', BoardEvaluator.evaluateHandQuality(sanitized, 'player1'));
    console.log('handQuality real', BoardEvaluator.evaluateHandQuality(withMarked, 'player1'));
    expect(true).toBe(true);
  });
});
