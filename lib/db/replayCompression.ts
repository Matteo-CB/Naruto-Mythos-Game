import { gzipSync, gunzipSync } from 'zlib';

export type CompressedReplay = Uint8Array<ArrayBuffer>;

export function compressReplay(payload: unknown): CompressedReplay {
  const json = JSON.stringify(payload);
  const gz = gzipSync(json, { level: 6 });
  const out = new Uint8Array(new ArrayBuffer(gz.byteLength));
  out.set(gz);
  return out;
}

export function decompressReplay<T = unknown>(buf: Buffer | Uint8Array): T {
  const source = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const decompressed = gunzipSync(source);
  return JSON.parse(decompressed.toString('utf8')) as T;
}

export function getReplayPayload<T = unknown>(
  game: { gameState: unknown; gameStateGz: Buffer | Uint8Array | null },
): T | null {
  if (game.gameStateGz) {
    try {
      return decompressReplay<T>(game.gameStateGz);
    } catch {
      return null;
    }
  }
  return (game.gameState ?? null) as T | null;
}
