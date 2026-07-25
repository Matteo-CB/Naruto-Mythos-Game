export type Seat = 'player1' | 'player2';

export interface SeatSocketsView {
  hostSocket?: string | null;
  guestSocket?: string | null;
}

export function resolveSeatBySocket(room: SeatSocketsView, socketId: string): Seat | null {
  if (room.hostSocket && room.hostSocket === socketId) return 'player1';
  if (room.guestSocket && room.guestSocket === socketId) return 'player2';
  return null;
}

export interface SeatIdsView {
  hostId?: string | null;
  guestId?: string | null;
}

export function resolveSeatByUserId(room: SeatIdsView, userId: string): Seat | null {
  if (room.hostId && room.hostId === userId) return 'player1';
  if (room.guestId && room.guestId === userId) return 'player2';
  return null;
}

export interface SeatResolution {
  seat: Seat | null;
  rebindNeeded: boolean;
}

export function resolveSeatForIdentity(
  room: SeatSocketsView & SeatIdsView,
  socketId: string,
  userId: string | null | undefined,
): SeatResolution {
  const bySocket = resolveSeatBySocket(room, socketId);
  if (bySocket) return { seat: bySocket, rebindNeeded: false };
  if (!userId) return { seat: null, rebindNeeded: false };
  const byUser = resolveSeatByUserId(room, userId);
  if (!byUser) return { seat: null, rebindNeeded: false };
  return { seat: byUser, rebindNeeded: true };
}

export interface TournamentStartView {
  tournamentId?: string | null;
  hostDeck?: unknown;
  guestDeck?: unknown;
  hostSocket?: string | null;
  guestSocket?: string | null;
  gameState?: unknown;
  finalized?: boolean;
  tournamentGameStarting?: boolean;
}

export function canStartTournamentGame(room: TournamentStartView): boolean {
  if (!room.tournamentId) return false;
  if (room.finalized === true) return false;
  if (room.gameState) return false;
  if (room.tournamentGameStarting === true) return false;
  if (!room.hostDeck || !room.guestDeck) return false;
  if (!room.hostSocket) return false;
  if (!room.guestSocket) return false;
  return true;
}

export interface SeatPresenceView {
  hostSocket?: string | null;
  guestSocket?: string | null;
  player1DisconnectedAt?: number | null;
  player2DisconnectedAt?: number | null;
  lastSeatInputAt?: { player1: number; player2: number } | null;
}

export interface SeatLiveness {
  seatSocketAlive: boolean;
  userHasLiveSocket: boolean;
}

export function disconnectStampFor(room: SeatPresenceView, seat: Seat): number | null {
  const stamp = seat === 'player1' ? room.player1DisconnectedAt : room.player2DisconnectedAt;
  return typeof stamp === 'number' ? stamp : null;
}

export function seatActedSince(room: SeatPresenceView, seat: Seat, since: number): boolean {
  const map = room.lastSeatInputAt;
  if (!map) return false;
  const at = seat === 'player1' ? map.player1 : map.player2;
  return typeof at === 'number' && at > since;
}

export function shouldForfeitForDisconnect(
  room: SeatPresenceView,
  seat: Seat,
  now: number,
  forfeitMs: number,
  liveness: SeatLiveness,
): boolean {
  const stamp = disconnectStampFor(room, seat);
  if (stamp === null) return false;
  if (now - stamp < forfeitMs) return false;
  if (liveness.seatSocketAlive) return false;
  if (liveness.userHasLiveSocket) return false;
  if (seatActedSince(room, seat, stamp)) return false;
  return true;
}

export function shouldClearDisconnectStamp(
  room: SeatPresenceView,
  seat: Seat,
  liveness: SeatLiveness,
): boolean {
  const stamp = disconnectStampFor(room, seat);
  if (stamp === null) return false;
  if (liveness.seatSocketAlive) return true;
  if (liveness.userHasLiveSocket) return true;
  return seatActedSince(room, seat, stamp);
}
