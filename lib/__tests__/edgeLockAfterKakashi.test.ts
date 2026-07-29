import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { grantEdge, isEdgeLockedAgainst } from '@/lib/engine/rules/edge';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { GameState } from '@/lib/engine/types';

function lockedBoard(): GameState {
  const state = buildSimState({
    p1: [simChar('KS-001-C', { owner: 'player1', instanceId: 'ally' })],
    p2: [simChar('KS-003-C', { owner: 'player2', instanceId: 'enemy' })],
    missions: 2,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  state.edgeLockedFor = 'player1';
  return state;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.ts')) out.push(full.replace(/\\/g, '/'));
  }
  return out;
}

describe('once Kakashi 148 locks the Edge, nothing takes it away that round', () => {
  it('the lock is read from the state', () => {
    const state = lockedBoard();
    expect(isEdgeLockedAgainst(state, 'player2'), 'the opponent is locked out').toBe(true);
    expect(isEdgeLockedAgainst(state, 'player1'), 'the holder is not locked out').toBe(false);
  });

  it('an effect cannot hand the Edge to the locked out player', () => {
    const state = lockedBoard();
    const after = grantEdge(state, 'player2');
    expect(after.edgeHolder, 'Temari and friends must not steal a locked Edge').toBe('player1');
  });

  it('the Edge still moves normally when no lock is set', () => {
    const state = lockedBoard();
    state.edgeLockedFor = null;
    expect(grantEdge(state, 'player2').edgeHolder).toBe('player2');
  });

  it('no engine code assigns the Edge outside the guarded helper', () => {
    const offenders: string[] = [];
    for (const file of [...walk('lib/effects'), ...walk('lib/engine')]) {
      if (file.includes('__tests__') || file.endsWith('lib/engine/rules/edge.ts') || file.endsWith('lib/engine/types.ts')) continue;
      const source = readFileSync(file, 'utf8');
      const lines = source.split('\n');
      lines.forEach((line, index) => {
        const assigns = /(?<!\.)\bedgeHolder\s*=[^=]/.test(line) || /(?<!\.)\bedgeHolder:\s*/.test(line);
        if (!assigns) return;
        if (/edgeHolder: state\.edgeHolder|edgeHolder: startingPlayer|edgeHolder = state\.edgeHolder/.test(line)) return;
        if (/edgeLockedFor/.test(line)) return;
        if (file.endsWith('phases/ActionPhase.ts')) return;
        offenders.push(`${file}:${index + 1}  ${line.trim().slice(0, 80)}`);
      });
    }
    expect(
      offenders,
      `these set the Edge directly instead of going through grantEdge:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
