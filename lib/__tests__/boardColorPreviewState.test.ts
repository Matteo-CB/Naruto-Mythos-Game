import { describe, it, expect } from 'vitest';
import { buildPreviewBoardState } from '@/lib/game/previewBoardState';
import { GameEngine } from '@/lib/engine/GameEngine';

describe('preview board state', () => {
  it('builds and is viewable', () => {
    const s = buildPreviewBoardState();
    expect(s.activeMissions).toHaveLength(3);
    const vs = GameEngine.getVisibleState(s, 'player1');
    expect(vs.myPlayer).toBe('player1');
    expect(vs.activeMissions[0].wonBy).toBe('player1');
    expect(vs.activeMissions[1].wonBy).toBe('player2');
    expect(vs.myState.hand.length).toBe(4);
    expect(vs.log.length).toBe(2);
  });
});
