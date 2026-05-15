import { describe, it, expect } from 'vitest';
import { buildGameCancelledStateReset } from '@/lib/socket/client';

describe('buildGameCancelledStateReset: client state cleanup on game:cancelled', () => {
  it('returns an object with gameCancelled populated', () => {
    const payload = buildGameCancelledStateReset('mulligan-idle', 'ROOM01');
    expect(payload.gameCancelled).toEqual({ reason: 'mulligan-idle', roomCode: 'ROOM01' });
  });

  it('clears visibleState so the game UI can unmount cleanly', () => {
    const payload = buildGameCancelledStateReset('mulligan-idle', 'ROOM01');
    expect(payload.visibleState).toBeNull();
  });

  it('clears gameStarted so /play/online does not think the user is still in a game', () => {
    const payload = buildGameCancelledStateReset('mulligan-idle', 'ROOM01');
    expect(payload.gameStarted).toBe(false);
  });

  it('clears roomCode and playerRole', () => {
    const payload = buildGameCancelledStateReset('mulligan-idle', 'ROOM01');
    expect(payload.roomCode).toBeNull();
    expect(payload.playerRole).toBeNull();
  });

  it('clears chessClock and resyncTimer', () => {
    const payload = buildGameCancelledStateReset('mulligan-idle', 'ROOM01');
    expect(payload.chessClock).toBeNull();
    expect(payload._resyncTimer).toBeNull();
  });

  it('clears opponentJoined and opponentDisconnected flags', () => {
    const payload = buildGameCancelledStateReset('mulligan-idle', 'ROOM01');
    expect(payload.opponentJoined).toBe(false);
    expect(payload.opponentDisconnected).toBe(false);
  });

  it('clears playerNames and currentRoomGameMode', () => {
    const payload = buildGameCancelledStateReset('mulligan-idle', 'ROOM01');
    expect(payload.playerNames).toBeNull();
    expect(payload.currentRoomGameMode).toBeNull();
  });

  it('resets rematchState to none and clears rematchRoomCode', () => {
    const payload = buildGameCancelledStateReset('mulligan-idle', 'ROOM01');
    expect(payload.rematchState).toBe('none');
    expect(payload.rematchRoomCode).toBeNull();
  });

  it('clears pendingReconnect so reconnect prompt cannot relaunch the dead game', () => {
    const payload = buildGameCancelledStateReset('mulligan-idle', 'ROOM01');
    expect(payload.pendingReconnect).toBeNull();
  });

  it('clears gameEnded and gameResult so end-screen does not show', () => {
    const payload = buildGameCancelledStateReset('mulligan-idle', 'ROOM01');
    expect(payload.gameEnded).toBe(false);
    expect(payload.gameResult).toBeNull();
  });
});
