import { describe, it, expect, beforeEach } from 'vitest';
import { bindSeatFromLiveSockets, rooms, type RoomData } from '@/lib/socket/server';
import { registerUserSocket, unregisterUserSocket } from '@/lib/socket/io';
import { canStartTournamentGame } from '@/lib/socket/roomSeats';

interface FakeSocket {
  id: string;
  connected: boolean;
  rooms: Set<string>;
  joined: string[];
  emitted: Array<{ event: string; data: unknown }>;
  join(room: string): void;
  emit(event: string, data: unknown): void;
  leave(room: string): void;
}

function fakeSocket(id: string, connected = true): FakeSocket {
  return {
    id,
    connected,
    rooms: new Set<string>(),
    joined: [],
    emitted: [],
    join(room: string) { this.joined.push(room); this.rooms.add(room); },
    emit(event: string, data: unknown) { this.emitted.push({ event, data }); },
    leave(room: string) { this.rooms.delete(room); },
  };
}

function fakeIo(sockets: FakeSocket[]) {
  const registry = new Map<string, FakeSocket>();
  for (const s of sockets) registry.set(s.id, s);
  return { sockets: { sockets: registry } };
}

function tournamentRoom(code: string): RoomData {
  return {
    code,
    hostId: 'user-host',
    hostSocket: '',
    guestId: 'user-guest',
    guestSocket: null,
    gameState: null,
    hostDeck: { characters: [], missions: [] },
    guestDeck: { characters: [], missions: [] },
    isPrivate: true,
    isRanked: false,
    isAnonymous: false,
    gameMode: 'casual',
    createdAt: Date.now(),
    replayInitialState: null,
    replayStateSnapshots: null,
    replaySnapshotLogLengths: null,
    replayClockSnapshots: null,
    finalized: false,
    isSealed: false,
    sealedBoosterCount: 5,
    sealedTimer: null,
    sealedDeadline: null,
    tournamentId: 't1',
    tournamentMatchId: 'm1',
    coinFlipDone: { player1: false, player2: false },
    spectators: new Map(),
    chatMessages: [],
    chatLastCleanup: Date.now(),
  } as unknown as RoomData;
}

describe('tournament seat reconciliation', () => {
  beforeEach(() => {
    rooms.clear();
    unregisterUserSocket('user-host', 'sock-host');
    unregisterUserSocket('user-guest', 'sock-guest');
    unregisterUserSocket('user-guest', 'sock-guest-bg');
    unregisterUserSocket('user-guest', 'sock-dead');
  });

  it('seats a player who never sent room:join but has a live socket', () => {
    const room = tournamentRoom('T-aaaaaa');
    rooms.set(room.code, room);
    const host = fakeSocket('sock-host');
    const guest = fakeSocket('sock-guest');
    registerUserSocket('user-host', 'sock-host');
    registerUserSocket('user-guest', 'sock-guest');
    const io = fakeIo([host, guest]) as never;

    expect(canStartTournamentGame(room)).toBe(false);
    expect(bindSeatFromLiveSockets(room, 'player1', io)).toBe(true);
    expect(bindSeatFromLiveSockets(room, 'player2', io)).toBe(true);

    expect(room.hostSocket).toBe('sock-host');
    expect(room.guestSocket).toBe('sock-guest');
    expect(canStartTournamentGame(room)).toBe(true);
  });

  it('tells the reconciled client it is back in the room so its UI syncs', () => {
    const room = tournamentRoom('T-bbbbbb');
    rooms.set(room.code, room);
    const guest = fakeSocket('sock-guest');
    registerUserSocket('user-guest', 'sock-guest');
    const io = fakeIo([guest]) as never;

    bindSeatFromLiveSockets(room, 'player2', io);

    expect(guest.joined).toContain('T-bbbbbb');
    expect(guest.joined).toContain('tournament:t1');
    expect(guest.emitted.some((e) => e.event === 'room:rejoined')).toBe(true);
  });

  it('prefers a socket that is already inside the match room over a background one', () => {
    const room = tournamentRoom('T-cccccc');
    rooms.set(room.code, room);
    const background = fakeSocket('sock-guest-bg');
    const inRoom = fakeSocket('sock-guest');
    inRoom.rooms.add('T-cccccc');
    registerUserSocket('user-guest', 'sock-guest-bg');
    registerUserSocket('user-guest', 'sock-guest');
    const io = fakeIo([background, inRoom]) as never;

    bindSeatFromLiveSockets(room, 'player2', io);

    expect(room.guestSocket).toBe('sock-guest');
  });

  it('leaves the seat unbound when the player has no live socket at all', () => {
    const room = tournamentRoom('T-dddddd');
    rooms.set(room.code, room);
    const dead = fakeSocket('sock-dead', false);
    registerUserSocket('user-guest', 'sock-dead');
    const io = fakeIo([dead]) as never;

    expect(bindSeatFromLiveSockets(room, 'player2', io)).toBe(false);
    expect(room.guestSocket).toBeNull();
  });

  it('keeps an already-live seat instead of rebinding it to another socket', () => {
    const room = tournamentRoom('T-eeeeee');
    room.guestSocket = 'sock-guest';
    rooms.set(room.code, room);
    const bound = fakeSocket('sock-guest');
    const other = fakeSocket('sock-guest-bg');
    registerUserSocket('user-guest', 'sock-guest');
    registerUserSocket('user-guest', 'sock-guest-bg');
    const io = fakeIo([bound, other]) as never;

    expect(bindSeatFromLiveSockets(room, 'player2', io)).toBe(true);
    expect(room.guestSocket).toBe('sock-guest');
    expect(other.emitted).toHaveLength(0);
  });

  it('does not hijack a socket that is playing another live game', () => {
    const room = tournamentRoom('T-ffffff');
    rooms.set(room.code, room);
    const otherGame = tournamentRoom('OTHER1');
    otherGame.tournamentId = undefined;
    otherGame.tournamentMatchId = undefined;
    otherGame.gameState = { phase: 'action' } as never;
    rooms.set(otherGame.code, otherGame);
    const guest = fakeSocket('sock-guest');
    registerUserSocket('user-guest', 'sock-guest');
    const io = fakeIo([guest]) as never;

    expect(bindSeatFromLiveSockets(room, 'player2', io)).toBe(false);
    expect(room.guestSocket).toBeNull();
  });
});
