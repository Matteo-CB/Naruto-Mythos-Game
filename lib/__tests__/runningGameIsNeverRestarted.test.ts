import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const SERVER = readFileSync('lib/socket/server.ts', 'utf8');

function handlerBody(event: string): string {
  const start = SERVER.indexOf(`socket.on('${event}'`);
  expect(start, `${event} handler exists`).toBeGreaterThan(-1);
  const next = SERVER.indexOf("socket.on('", start + 20);
  return SERVER.slice(start, next === -1 ? SERVER.length : next);
}

describe('a deck submission can never restart a game that is already running', () => {
  it('the deck handler bails out before touching a live game', () => {
    const body = handlerBody('room:select-deck');

    const guard = body.indexOf("room.gameState && room.gameState.phase !== 'gameOver'");
    const deckWrite = body.indexOf('room.hostDeck = safeDeck');
    const creation = body.indexOf('Both decks submitted');

    expect(guard, 'the guard exists').toBeGreaterThan(-1);
    expect(deckWrite, 'decks are stored somewhere in the handler').toBeGreaterThan(-1);
    expect(guard, 'the guard runs before any deck is stored').toBeLessThan(deckWrite);
    expect(guard, 'and long before a new game could be created').toBeLessThan(creation);
  });

  it('the guard resyncs the sender instead of leaving them on a dead screen', () => {
    const body = handlerBody('room:select-deck');
    const guardBlock = body.slice(
      body.indexOf("room.gameState && room.gameState.phase !== 'gameOver'"),
      body.indexOf('Invalid deck payload'),
    );
    expect(guardBlock).toContain('sendSeatState');
  });

  it('a finished game still allows a rematch deck submission', () => {
    const body = handlerBody('room:select-deck');
    const guardBlock = body.slice(0, body.indexOf('Invalid deck payload'));
    expect(guardBlock, 'a game over does not block the next deck').toContain("phase !== 'gameOver'");
    expect(guardBlock, 'a finalized room does not block it either').toContain('!room.finalized');
  });

  it('the rematch path clears the state first, so the guard cannot block it', () => {
    const rematch = SERVER.slice(SERVER.indexOf('Rematch accepted in room'));
    const clear = rematch.indexOf('room.gameState = null');
    expect(clear, 'the rematch wipes the finished game before deck selection').toBeGreaterThan(-1);
    expect(clear).toBeLessThan(400);
  });
});
