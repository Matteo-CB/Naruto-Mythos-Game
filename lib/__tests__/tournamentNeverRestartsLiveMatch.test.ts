import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const HANDLERS = 'lib/socket/tournamentHandlers.ts';
const SERVER = 'lib/socket/server.ts';

function reopenBody(): string {
  const source = readFileSync(HANDLERS, 'utf8');
  const start = source.indexOf('export async function reopenTournamentMatch');
  expect(start, 'reopenTournamentMatch must exist').toBeGreaterThan(-1);
  const next = source.indexOf('\nexport ', start + 10);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('a tournament match that is already being played is never reopened', () => {
  it('the reopen routine refuses when a game id is already recorded', () => {
    const body = reopenBody();
    expect(body, 'it must read the game id before wiping the room').toContain('gameId');
    expect(body, 'it must bail out early').toMatch(/refusing to reopen/);
  });

  it('the reopen routine refuses when the live room still holds a running game', () => {
    const body = reopenBody();
    expect(body).toContain('liveRoom');
    expect(body, 'a running game protects the room').toMatch(/liveRoom\?\.gameState/);
  });

  it('the bail out happens before the room is deleted', () => {
    const body = reopenBody();
    const refuseAt = body.indexOf('refusing to reopen');
    const deleteAt = body.indexOf('rooms.delete');
    expect(refuseAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeGreaterThan(-1);
    expect(refuseAt, 'the guard must come first, otherwise the room is already gone').toBeLessThan(deleteAt);
  });

  it('the absence timers are cleared once the game actually starts', () => {
    const source = readFileSync(SERVER, 'utf8');
    expect(
      source,
      'clearTournamentMatchTimers was dead code, which let the timer keep reopening a live match',
    ).toContain('clearTournamentMatchTimers(room.tournamentMatchId)');
  });
});
