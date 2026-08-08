export const SPECTATE_TILE_CHANNEL = 'naruto-mythos-spectate-tile';

export type SpectateTileMessage =
  | { channel: typeof SPECTATE_TILE_CHANNEL; kind: 'ended'; roomCode: string }
  | { channel: typeof SPECTATE_TILE_CHANNEL; kind: 'error'; roomCode: string; errorKey?: string };

export type SpectateTileEvent =
  | { kind: 'ended'; roomCode: string }
  | { kind: 'error'; roomCode: string; errorKey?: string };

export function postTileMessage(event: SpectateTileEvent): void {
  if (typeof window === 'undefined' || window.parent === window) return;
  window.parent.postMessage({ channel: SPECTATE_TILE_CHANNEL, ...event }, window.location.origin);
}

export function readTileMessage(data: unknown): SpectateTileEvent | null {
  if (!data || typeof data !== 'object') return null;
  const message = data as SpectateTileMessage;
  if (message.channel !== SPECTATE_TILE_CHANNEL) return null;
  if (message.kind !== 'ended' && message.kind !== 'error') return null;
  if (typeof message.roomCode !== 'string' || message.roomCode.length === 0) return null;
  return message.kind === 'ended'
    ? { kind: 'ended', roomCode: message.roomCode }
    : { kind: 'error', roomCode: message.roomCode, errorKey: message.errorKey };
}
