import { prisma } from '@/lib/db/prisma';

export const TOPDECK_LEADER_KEY = 'leader-lock';
export const TOPDECK_LEADER_TTL_MS = 90_000;

interface LeaderValue {
  instanceId: string;
}

export async function acquireOrRenewLeaderLock(
  instanceId: string,
  now: number = Date.now(),
  ttlMs: number = TOPDECK_LEADER_TTL_MS,
): Promise<boolean> {
  const heartbeatAt = new Date(now);
  const row = await prisma.topdeckPollerState.findUnique({ where: { key: TOPDECK_LEADER_KEY } });

  if (!row) {
    try {
      await prisma.topdeckPollerState.create({
        data: { key: TOPDECK_LEADER_KEY, value: { instanceId }, heartbeatAt },
      });
      return true;
    } catch {
      return false;
    }
  }

  const current = row.value as LeaderValue | null;
  const isUs = current?.instanceId === instanceId;
  const isStale = row.heartbeatAt.getTime() <= now - ttlMs;
  if (!isUs && !isStale) return false;

  const result = await prisma.topdeckPollerState.updateMany({
    where: { key: TOPDECK_LEADER_KEY, heartbeatAt: row.heartbeatAt },
    data: { value: { instanceId }, heartbeatAt },
  });
  return result.count === 1;
}

export async function releaseLeaderLock(instanceId: string): Promise<void> {
  const row = await prisma.topdeckPollerState.findUnique({ where: { key: TOPDECK_LEADER_KEY } });
  if (row && (row.value as LeaderValue | null)?.instanceId === instanceId) {
    await prisma.topdeckPollerState.deleteMany({ where: { key: TOPDECK_LEADER_KEY } });
  }
}

export async function isLeader(instanceId: string, now: number = Date.now(), ttlMs: number = TOPDECK_LEADER_TTL_MS): Promise<boolean> {
  const row = await prisma.topdeckPollerState.findUnique({ where: { key: TOPDECK_LEADER_KEY } });
  if (!row) return false;
  const current = row.value as LeaderValue | null;
  const fresh = row.heartbeatAt.getTime() > now - ttlMs;
  return current?.instanceId === instanceId && fresh;
}
