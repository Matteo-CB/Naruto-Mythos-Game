import { describe, it, expect } from 'vitest';
import {
  resolveSeatBySocket,
  resolveSeatByUserId,
  resolveSeatForIdentity,
} from '@/lib/socket/roomSeats';

const room = {
  hostSocket: 'sock-host',
  guestSocket: 'sock-guest',
  hostId: 'user-host',
  guestId: 'user-guest',
};

describe('resolveSeatForIdentity', () => {
  it('resolves by socket id first and asks for no rebinding', () => {
    expect(resolveSeatForIdentity(room, 'sock-host', 'user-host')).toEqual({ seat: 'player1', rebindNeeded: false });
    expect(resolveSeatForIdentity(room, 'sock-guest', 'user-guest')).toEqual({ seat: 'player2', rebindNeeded: false });
  });

  it('falls back to the authenticated identity when the socket id is stale, and flags the rebinding', () => {
    expect(resolveSeatForIdentity(room, 'sock-new', 'user-host')).toEqual({ seat: 'player1', rebindNeeded: true });
    expect(resolveSeatForIdentity(room, 'sock-new', 'user-guest')).toEqual({ seat: 'player2', rebindNeeded: true });
  });

  it('recovers a seat whose socket was cleared by a disconnect', () => {
    const orphaned = { ...room, hostSocket: '' };
    expect(resolveSeatForIdentity(orphaned, 'sock-new', 'user-host')).toEqual({ seat: 'player1', rebindNeeded: true });
  });

  it('refuses to resolve a seat for a user who is not in the room', () => {
    expect(resolveSeatForIdentity(room, 'sock-new', 'user-stranger')).toEqual({ seat: null, rebindNeeded: false });
  });

  it('refuses to resolve a seat without an identity, so an anonymous socket can never steal one', () => {
    expect(resolveSeatForIdentity(room, 'sock-new', null)).toEqual({ seat: null, rebindNeeded: false });
    expect(resolveSeatForIdentity(room, 'sock-new', undefined)).toEqual({ seat: null, rebindNeeded: false });
  });

  it('never matches an empty socket id against an empty seat socket', () => {
    const orphaned = { ...room, hostSocket: '', guestSocket: null };
    expect(resolveSeatBySocket(orphaned, '')).toBe(null);
  });

  it('keeps resolveSeatByUserId consistent with the identity fallback', () => {
    expect(resolveSeatByUserId(room, 'user-host')).toBe('player1');
    expect(resolveSeatByUserId(room, 'user-guest')).toBe('player2');
    expect(resolveSeatByUserId(room, 'user-stranger')).toBe(null);
  });
});
