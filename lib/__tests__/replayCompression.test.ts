import { describe, it, expect } from 'vitest';
import { compressReplay, decompressReplay, getReplayPayload } from '../db/replayCompression';

describe('replayCompression', () => {
  it('roundtrips a small object', () => {
    const payload = { log: [{ turn: 1, action: 'PLAY' }], score: { p1: 5, p2: 3 } };
    const compressed = compressReplay(payload);
    expect(compressed.byteLength).toBeGreaterThan(0);
    const restored = decompressReplay(compressed);
    expect(restored).toEqual(payload);
  });

  it('roundtrips a large repetitive object with high compression ratio', () => {
    const payload = {
      log: Array.from({ length: 1000 }, (_, i) => ({
        turn: (i % 4) + 1,
        type: 'PLAY_CHARACTER',
        player: i % 2 ? 'player1' : 'player2',
        cardId: 'KS-001-UC',
      })),
    };
    const json = JSON.stringify(payload);
    const compressed = compressReplay(payload);
    const ratio = json.length / compressed.byteLength;
    expect(ratio).toBeGreaterThan(10);
    const restored = decompressReplay(compressed);
    expect(restored).toEqual(payload);
  });

  it('preserves nested arrays, nulls, numbers and strings exactly', () => {
    const payload = {
      a: [1, 2, [3, [4, 5]]],
      b: null,
      c: 0.123456789,
      d: 'éàü\n\t"quoted"',
      e: true,
      f: false,
    };
    const restored = decompressReplay(compressReplay(payload));
    expect(restored).toEqual(payload);
  });

  it('getReplayPayload prefers compressed when both fields exist', () => {
    const original = { test: 'compressed' };
    const compressed = compressReplay(original);
    const result = getReplayPayload({
      gameState: { test: 'legacy' },
      gameStateGz: compressed,
    });
    expect(result).toEqual(original);
  });

  it('getReplayPayload falls back to gameState when gameStateGz is null', () => {
    const result = getReplayPayload({
      gameState: { test: 'legacy' },
      gameStateGz: null,
    });
    expect(result).toEqual({ test: 'legacy' });
  });

  it('getReplayPayload returns null when both are null', () => {
    const result = getReplayPayload({ gameState: null, gameStateGz: null });
    expect(result).toBeNull();
  });

  it('decompressReplay handles a Buffer (raw Node Buffer) input', () => {
    const original = { hello: 'world' };
    const compressed = compressReplay(original);
    const asBuffer = Buffer.from(compressed);
    const restored = decompressReplay(asBuffer);
    expect(restored).toEqual(original);
  });
});
