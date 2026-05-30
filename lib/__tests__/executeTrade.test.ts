import { describe, it, expect, vi, beforeEach } from 'vitest';

const roomFindUnique = vi.fn();
const roomUpdate = vi.fn();
const roomUpdateMany = vi.fn();
const logCreate = vi.fn();
const invFindMany = vi.fn();
const invFindUnique = vi.fn();
const invUpdateMany = vi.fn();
const invUpsert = vi.fn();
const friendshipFindFirst = vi.fn();
const userFindUnique = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    tradeRoom: {
      findUnique: (...a: unknown[]) => roomFindUnique(...a),
      update: (...a: unknown[]) => roomUpdate(...a),
      updateMany: (...a: unknown[]) => roomUpdateMany(...a),
    },
    tradeLog: {
      create: (...a: unknown[]) => logCreate(...a),
    },
    variantInventory: {
      findMany: (...a: unknown[]) => invFindMany(...a),
      findUnique: (...a: unknown[]) => invFindUnique(...a),
      updateMany: (...a: unknown[]) => invUpdateMany(...a),
      upsert: (...a: unknown[]) => invUpsert(...a),
    },
    friendship: {
      findFirst: (...a: unknown[]) => friendshipFindFirst(...a),
    },
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
    },
  },
}));

import { executeTrade } from '@/lib/trade/executeTrade';

const READY_ROOM = {
  id: 'room1',
  creatorId: 'alice',
  guestId: 'bob',
  status: 'active',
  creatorOffer: ['KS-104-RA'],
  guestOffer: ['KS-105-RA'],
  creatorReady: true,
  guestReady: true,
};

describe('executeTrade', () => {
  beforeEach(() => {
    roomFindUnique.mockReset();
    roomUpdate.mockReset();
    roomUpdateMany.mockReset();
    logCreate.mockReset();
    invFindMany.mockReset();
    invFindUnique.mockReset();
    invUpdateMany.mockReset();
    invUpsert.mockReset();
    friendshipFindFirst.mockReset();
    userFindUnique.mockReset();
    roomUpdate.mockResolvedValue({});
    roomUpdateMany.mockResolvedValue({ count: 1 });
    logCreate.mockResolvedValue({});
    invUpsert.mockResolvedValue({ count: 1 });
    invUpdateMany.mockResolvedValue({ count: 1 });
    friendshipFindFirst.mockResolvedValue({ id: 'friendship1' });
    userFindUnique.mockResolvedValue({ elo: 1500 });
  });

  it('returns not_found when room missing', async () => {
    roomUpdateMany.mockResolvedValue({ count: 0 });
    roomFindUnique.mockResolvedValue(null);
    const r = await executeTrade('x');
    expect(r).toEqual({ success: false, error: 'not_found' });
  });

  it('returns already_done for completed room', async () => {
    roomUpdateMany.mockResolvedValue({ count: 0 });
    roomFindUnique.mockResolvedValue({ ...READY_ROOM, status: 'completed' });
    const r = await executeTrade('room1');
    expect(r.error).toBe('already_done');
  });

  it('returns already_done when claim is lost to a concurrent execution', async () => {
    roomUpdateMany.mockResolvedValue({ count: 0 });
    roomFindUnique.mockResolvedValue({ ...READY_ROOM, status: 'executing' });
    const r = await executeTrade('room1');
    expect(r.error).toBe('already_done');
  });

  it('returns not_ready if both not ready', async () => {
    roomUpdateMany.mockResolvedValue({ count: 0 });
    roomFindUnique.mockResolvedValue({ ...READY_ROOM, guestReady: false });
    const r = await executeTrade('room1');
    expect(r.error).toBe('not_ready');
  });

  it('returns not_friends if friendship was removed mid-trade', async () => {
    roomFindUnique.mockResolvedValue(READY_ROOM);
    friendshipFindFirst.mockResolvedValue(null);
    const r = await executeTrade('room1');
    expect(r.error).toBe('not_friends');
  });

  it('returns tier_too_low if a player dropped below tier 5', async () => {
    roomFindUnique.mockResolvedValue(READY_ROOM);
    userFindUnique.mockResolvedValueOnce({ elo: 1500 }).mockResolvedValueOnce({ elo: 500 });
    const r = await executeTrade('room1');
    expect(r.error).toBe('tier_too_low');
  });

  it('returns invalid_offer for tournament-vs-nontournament', async () => {
    roomFindUnique.mockResolvedValue({
      ...READY_ROOM,
      creatorOffer: ['KS-108-MV'],
      guestOffer: ['KS-104-RA'],
    });
    const r = await executeTrade('room1');
    expect(r.error).toBe('invalid_offer');
  });

  it('returns insufficient when a player does not own offered cards', async () => {
    roomFindUnique.mockResolvedValue(READY_ROOM);
    invFindMany.mockResolvedValue([]);
    const r = await executeTrade('room1');
    expect(r.error).toBe('insufficient');
  });

  it('executes a valid trade: decrements both, increments both, logs', async () => {
    roomFindUnique.mockResolvedValue(READY_ROOM);
    invFindMany.mockImplementation(({ where }: { where: { userId: string } }) => {
      if (where.userId === 'alice') return Promise.resolve([{ cardId: 'KS-104-RA', count: 1 }]);
      if (where.userId === 'bob') return Promise.resolve([{ cardId: 'KS-105-RA', count: 1 }]);
      return Promise.resolve([]);
    });
    invUpdateMany.mockResolvedValue({ count: 1 });

    const r = await executeTrade('room1');
    expect(r.success).toBe(true);
    expect(invUpdateMany).toHaveBeenCalledTimes(2);
    expect(invUpsert).toHaveBeenCalledTimes(2);
    expect(roomUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'completed' }),
    }));
    expect(logCreate).toHaveBeenCalledTimes(1);
  });

  it('rolls back when decrement fails mid-way', async () => {
    roomFindUnique.mockResolvedValue({
      ...READY_ROOM,
      creatorOffer: ['KS-104-RA', 'KS-106-RA'],
      guestOffer: [],
    });
    invFindMany.mockResolvedValue([
      { cardId: 'KS-104-RA', count: 1 },
      { cardId: 'KS-106-RA', count: 1 },
    ]);
    let call = 0;
    invUpdateMany.mockImplementation(() => {
      call++;
      return Promise.resolve({ count: call === 1 ? 1 : 0 });
    });

    const r = await executeTrade('room1');
    expect(r.error).toBe('insufficient');
    expect(invUpsert).toHaveBeenCalledTimes(1);
    expect(logCreate).not.toHaveBeenCalled();
  });
});
