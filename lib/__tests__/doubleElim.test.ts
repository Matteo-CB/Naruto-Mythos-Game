import { describe, it, expect } from 'vitest';
import { generateDoubleElimBracket, loserDropTarget, winnerAdvanceTarget } from '../tournament/doubleElimEngine';

function players(n: number) {
  return Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, username: `P${i + 1}` }));
}

describe('doubleElimEngine.generateDoubleElimBracket', () => {
  it('returns nothing for <2 players', () => {
    const r = generateDoubleElimBracket(players(1));
    expect(r.matches.length).toBe(0);
    expect(r.totalRounds).toBe(0);
  });

  it('builds correct match counts for size 8', () => {
    const r = generateDoubleElimBracket(players(8));
    expect(r.wbRounds).toBe(3);
    expect(r.lbRounds).toBe(4);

    const wb = r.matches.filter((m) => m.bracket === 'winners');
    const lb = r.matches.filter((m) => m.bracket === 'losers');
    const gf = r.matches.filter((m) => m.bracket === 'grand_final');

    expect(wb.filter((m) => m.round === 1).length).toBe(4);
    expect(wb.filter((m) => m.round === 2).length).toBe(2);
    expect(wb.filter((m) => m.round === 3).length).toBe(1);

    expect(lb.filter((m) => m.round === 1).length).toBe(2);
    expect(lb.filter((m) => m.round === 2).length).toBe(2);
    expect(lb.filter((m) => m.round === 3).length).toBe(1);
    expect(lb.filter((m) => m.round === 4).length).toBe(1);

    expect(gf.length).toBe(1);
    expect(gf[0].round).toBe(1);
  });

  it('builds correct match counts for size 16', () => {
    const r = generateDoubleElimBracket(players(16));
    expect(r.wbRounds).toBe(4);
    expect(r.lbRounds).toBe(6);

    const wb = r.matches.filter((m) => m.bracket === 'winners');
    const lb = r.matches.filter((m) => m.bracket === 'losers');
    expect(wb.length).toBe(8 + 4 + 2 + 1);
    expect(lb.length).toBe(4 + 4 + 2 + 2 + 1 + 1);
  });

  it('handles 5 players (size=8 with byes in WB R1)', () => {
    const r = generateDoubleElimBracket(players(5));
    const wbR1 = r.matches.filter((m) => m.bracket === 'winners' && m.round === 1);
    expect(wbR1.length).toBe(4);
    const byes = wbR1.filter((m) => m.isBye);
    expect(byes.length).toBe(3);
    for (const b of byes) {
      expect(b.status).toBe('completed');
      expect(b.winnerId).toBeTruthy();
    }
  });

  it('first WB R1 match with both players is `ready`', () => {
    const r = generateDoubleElimBracket(players(8));
    const r1 = r.matches.filter((m) => m.bracket === 'winners' && m.round === 1);
    for (const m of r1) {
      if (m.player1Id && m.player2Id) {
        expect(m.status).toBe('ready');
      }
    }
  });
});

describe('doubleElimEngine.loserDropTarget', () => {
  it('WB R1 loser drops to LB R1 paired', () => {
    const drop0 = loserDropTarget({ bracket: 'winners', round: 1, matchIndex: 0 }, 3);
    expect(drop0).toEqual({ bracket: 'losers', round: 1, matchIndex: 0, slot: 'player1' });
    const drop1 = loserDropTarget({ bracket: 'winners', round: 1, matchIndex: 1 }, 3);
    expect(drop1).toEqual({ bracket: 'losers', round: 1, matchIndex: 0, slot: 'player2' });
    const drop2 = loserDropTarget({ bracket: 'winners', round: 1, matchIndex: 2 }, 3);
    expect(drop2).toEqual({ bracket: 'losers', round: 1, matchIndex: 1, slot: 'player1' });
  });

  it('WB R2 loser drops to LB R2 absorbing slot', () => {
    const drop = loserDropTarget({ bracket: 'winners', round: 2, matchIndex: 0 }, 3);
    expect(drop).toEqual({ bracket: 'losers', round: 2, matchIndex: 0, slot: 'player2' });
  });

  it('WB final loser drops to LB final', () => {
    const drop = loserDropTarget({ bracket: 'winners', round: 3, matchIndex: 0 }, 3);
    expect(drop).toEqual({ bracket: 'losers', round: 4, matchIndex: 0, slot: 'player2' });
  });
});

describe('doubleElimEngine.winnerAdvanceTarget', () => {
  it('WB R1 winner advances to WB R2', () => {
    const adv = winnerAdvanceTarget({ bracket: 'winners', round: 1, matchIndex: 0 }, 3, 4);
    expect(adv).toEqual({ bracket: 'winners', round: 2, matchIndex: 0, slot: 'player1' });
  });

  it('WB final winner goes to GF as player1 (WB seat)', () => {
    const adv = winnerAdvanceTarget({ bracket: 'winners', round: 3, matchIndex: 0 }, 3, 4);
    expect(adv).toEqual({ bracket: 'grand_final', round: 1, matchIndex: 0, slot: 'player1' });
  });

  it('LB final winner goes to GF as player2 (LB seat)', () => {
    const adv = winnerAdvanceTarget({ bracket: 'losers', round: 4, matchIndex: 0 }, 3, 4);
    expect(adv).toEqual({ bracket: 'grand_final', round: 1, matchIndex: 0, slot: 'player2' });
  });
});
