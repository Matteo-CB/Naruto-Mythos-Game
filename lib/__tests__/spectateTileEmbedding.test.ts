import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const NEXT_CONFIG = read('next.config.ts');
const TILE_PAGE = read(join('app', '[locale]', 'spectate', '[roomCode]', 'page.tsx'));
const TOURNAMENT_SPECTATE = read(join('app', '[locale]', 'tournaments', '[id]', 'spectate', 'page.tsx'));
const SOCKET_CLIENT = read(join('lib', 'socket', 'client.ts'));
const SERVER = read(join('lib', 'socket', 'server.ts'));

const LOCALES = ['en', 'fr', 'es', 'ja', 'pt', 'it', 'pl'];

describe('the tournament spectate tiles are allowed to load in a frame', () => {
  it('the tournament spectate page really embeds the tile page in an iframe', () => {
    expect(TOURNAMENT_SPECTATE).toContain('<iframe');
    expect(TOURNAMENT_SPECTATE).toContain('/spectate/${tile.roomCode}');
  });

  it('the content security policy allows same origin framing', () => {
    const directive = NEXT_CONFIG.match(/"frame-ancestors ([^"]+)"/);
    expect(directive, 'frame-ancestors must be declared').not.toBeNull();
    expect(
      directive?.[1],
      "frame-ancestors 'none' blocks the spectate tiles even on the same origin",
    ).toBe("'self'");
  });

  it('X-Frame-Options does not contradict the policy', () => {
    const header = NEXT_CONFIG.match(/"X-Frame-Options", value: "([A-Z]+)"/);
    expect(header, 'X-Frame-Options must be declared').not.toBeNull();
    expect(
      header?.[1],
      'DENY blocks same origin framing, which is what the spectate tiles need',
    ).toBe('SAMEORIGIN');
  });
});

describe('a spectate tile only reports its own errors', () => {
  it('the tile reads the dedicated spectate error, never the shared socket error', () => {
    expect(TILE_PAGE).toContain('spectateErrorKey');
    expect(
      TILE_PAGE.includes('s.errorKey'),
      'the shared errorKey carries connection and rejoin failures that have nothing to do with spectating',
    ).toBe(false);
    expect(TILE_PAGE.includes('s.error)')).toBe(false);
  });

  it('the store clears the spectate error when a state arrives and when a tile joins', () => {
    expect(SOCKET_CLIENT).toContain('spectateErrorKey: null');
    const joinBlock = SOCKET_CLIENT.slice(SOCKET_CLIENT.indexOf("socket.emit('spectate:join'"));
    expect(joinBlock.slice(0, 300)).toContain('spectateErrorKey: null');
  });

  it('every error key the server emits resolves to a real translation in all seven locales', () => {
    const emitted = [...SERVER.matchAll(/errorKey: '(spectate\.[a-zA-Z]+)'/g)].map((m) => m[1]);
    expect(emitted.length, 'the server must emit spectate error keys').toBeGreaterThan(0);

    const mapped = emitted.map((k) => k.replace('spectate.', ''));
    expect(TILE_PAGE, 'the tile must strip the prefix, not rewrite it').toContain("replace('spectate.', '')");

    for (const locale of LOCALES) {
      const messages = JSON.parse(read(join('messages', `${locale}.json`))) as {
        spectator?: Record<string, unknown>;
      };
      const namespace = messages.spectator ?? {};
      for (const key of [...new Set(mapped)]) {
        expect(typeof namespace[key], `spectator.${key} missing in ${locale}.json`).toBe('string');
      }
    }
  });
});
