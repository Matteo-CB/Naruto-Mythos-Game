import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();
const create = vi.fn();
const updateMany = vi.fn();
const deleteMany = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    topdeckPollerState: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      create: (...a: unknown[]) => create(...a),
      updateMany: (...a: unknown[]) => updateMany(...a),
      deleteMany: (...a: unknown[]) => deleteMany(...a),
    },
  },
}));

import { acquireOrRenewLeaderLock, TOPDECK_LEADER_TTL_MS } from '@/lib/topdeck/leaderLock';

beforeEach(() => {
  findUnique.mockReset();
  create.mockReset();
  updateMany.mockReset();
  deleteMany.mockReset();
});

describe('topdeck leader lock', () => {
  it('acquires when no row exists', async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({});
    expect(await acquireOrRenewLeaderLock('A', 1000)).toBe(true);
    expect(create).toHaveBeenCalled();
  });

  it('returns false if the create races (unique violation)', async () => {
    findUnique.mockResolvedValue(null);
    create.mockRejectedValue(new Error('duplicate key'));
    expect(await acquireOrRenewLeaderLock('A', 1000)).toBe(false);
  });

  it('renews when we are the current leader and CAS succeeds', async () => {
    findUnique.mockResolvedValue({ value: { instanceId: 'A' }, heartbeatAt: new Date(1000) });
    updateMany.mockResolvedValue({ count: 1 });
    expect(await acquireOrRenewLeaderLock('A', 2000)).toBe(true);
    expect(updateMany).toHaveBeenCalled();
  });

  it('fails when a fresh other leader holds the lock', async () => {
    findUnique.mockResolvedValue({ value: { instanceId: 'B' }, heartbeatAt: new Date(2000) });
    expect(await acquireOrRenewLeaderLock('A', 2500)).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('takes over when the other leader is stale (CAS succeeds)', async () => {
    findUnique.mockResolvedValue({ value: { instanceId: 'B' }, heartbeatAt: new Date(1000) });
    updateMany.mockResolvedValue({ count: 1 });
    expect(await acquireOrRenewLeaderLock('A', 1000 + TOPDECK_LEADER_TTL_MS + 1)).toBe(true);
  });

  it('loses the takeover CAS race (count 0)', async () => {
    findUnique.mockResolvedValue({ value: { instanceId: 'B' }, heartbeatAt: new Date(1000) });
    updateMany.mockResolvedValue({ count: 0 });
    expect(await acquireOrRenewLeaderLock('A', 1000 + TOPDECK_LEADER_TTL_MS + 1)).toBe(false);
  });
});
