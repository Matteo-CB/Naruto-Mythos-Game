import type { RoomData } from '@/lib/socket/server';

export function clearAllMatchRoomTimers(room: RoomData): void {
  if (room.tournamentJoinTimer) {
    clearTimeout(room.tournamentJoinTimer);
    room.tournamentJoinTimer = null;
  }
  if (room.tournamentInviteTimer) {
    clearInterval(room.tournamentInviteTimer);
    room.tournamentInviteTimer = null;
  }
  if (room.tournamentGameTimer) {
    clearTimeout(room.tournamentGameTimer);
    room.tournamentGameTimer = null;
  }
  if (room.sealedTimer) {
    clearTimeout(room.sealedTimer);
    room.sealedTimer = null;
  }
  if (room.chessClockTickTimer) {
    clearInterval(room.chessClockTickTimer);
    room.chessClockTickTimer = null;
  }
  if (room.chessClockMulliganTimer) {
    clearTimeout(room.chessClockMulliganTimer);
    room.chessClockMulliganTimer = null;
  }
}

export function finalizeAndScheduleRoomDeletion(
  rooms: Map<string, RoomData>,
  roomCode: string,
  delayMs: number = 10_000,
): void {
  const room = rooms.get(roomCode);
  if (!room) return;
  room.finalized = true;
  clearAllMatchRoomTimers(room);
  setTimeout(() => {
    const r = rooms.get(roomCode);
    if (r === room) rooms.delete(roomCode);
  }, delayMs);
}
