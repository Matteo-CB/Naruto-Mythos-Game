import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => {
  const m = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    sanction: { create: vi.fn(), findMany: vi.fn(async () => []), findUnique: vi.fn(), update: vi.fn() },
    playerReport: { findUnique: vi.fn(), update: vi.fn() },
    playerNotification: { create: vi.fn() },
    adminAction: { create: vi.fn() },
  };
  return { prisma: m };
});

vi.mock('@/lib/auth/adminGuard', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/socket/io', () => ({
  emitToUser: vi.fn(),
}));

vi.mock('@/lib/socket/chatLockBridge', () => ({
  refreshChatLock: vi.fn(),
}));

import { prisma } from '@/lib/db/prisma';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { POST as sanctionPOST } from '../../app/api/admin/moderation/sanction/route';
import { POST as resolvePOST } from '../../app/api/admin/moderation/resolve/route';
import { POST as revokePOST } from '../../app/api/admin/moderation/revoke/route';
import { NextRequest } from 'next/server';

const p = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const admin = requireAdmin as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/moderation/x', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  admin.mockResolvedValue({ userId: 'admin1', username: 'Kutxyt' });
  p.user.findUnique.mockResolvedValue({ id: 'target1', username: 'Bad Guy' });
  p.user.update.mockResolvedValue({});
  p.sanction.create.mockResolvedValue({ id: 'sanc1', userId: 'target1', expiresAt: new Date(4200), createdAt: new Date() });
  p.playerNotification.create.mockResolvedValue({ id: 'notif1', createdAt: new Date() });
  p.adminAction.create.mockResolvedValue({});
});

describe('POST /api/admin/moderation/sanction', () => {
  it('rejects non-admins', async () => {
    admin.mockResolvedValue(null);
    const res = await sanctionPOST(req({ userId: 'target1', type: 'warn', reason: 'insultes', durationMs: null }));
    expect(res.status).toBe(403);
  });

  it('rejects invalid durations for the type', async () => {
    const res = await sanctionPOST(req({ userId: 'target1', type: 'ranked_ban', reason: 'triche', durationMs: null }));
    expect(res.status).toBe(400);
    expect(p.sanction.create).not.toHaveBeenCalled();
  });

  it('warn notifies the offender only', async () => {
    const res = await sanctionPOST(req({ userId: 'target1', type: 'warn', reason: 'insultes', durationMs: null }));
    expect(res.status).toBe(201);
    expect(p.playerNotification.create).toHaveBeenCalledTimes(1);
    const call = p.playerNotification.create.mock.calls[0][0];
    expect(call.data.userId).toBe('target1');
    expect(call.data.kind).toBe('warn');
    expect(p.adminAction.create).toHaveBeenCalledTimes(1);
  });

  it('shadow mute never notifies anyone', async () => {
    const res = await sanctionPOST(req({ userId: 'target1', type: 'shadow_mute', reason: 'troll', durationMs: 60 * 60 * 1000 }));
    expect(res.status).toBe(201);
    expect(p.playerNotification.create).not.toHaveBeenCalled();
  });

  it('resolving a report sanctions the offender AND notifies the victim without detail', async () => {
    p.playerReport.findUnique.mockResolvedValue({ id: 'rep1', status: 'pending', reporterId: 'victim1', targetId: 'target1' });
    p.playerReport.update.mockResolvedValue({});
    const res = await sanctionPOST(req({ userId: 'target1', type: 'mute_chat', reason: 'spam', durationMs: 60 * 60 * 1000, reportId: 'rep1' }));
    expect(res.status).toBe(201);
    expect(p.playerNotification.create).toHaveBeenCalledTimes(2);
    const kinds = p.playerNotification.create.mock.calls.map((c) => [c[0].data.userId, c[0].data.kind]);
    expect(kinds).toContainEqual(['target1', 'sanction_notice']);
    expect(kinds).toContainEqual(['victim1', 'victim_notice']);
    const victimCall = p.playerNotification.create.mock.calls.find((c) => c[0].data.kind === 'victim_notice')![0];
    expect(victimCall.data.payload).toEqual({});
    expect(p.playerReport.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'resolved', sanctionId: 'sanc1' }),
    }));
  });
});

describe('POST /api/admin/moderation/resolve (dismiss)', () => {
  it('dismisses without notifying anyone', async () => {
    p.playerReport.findUnique.mockResolvedValue({ id: 'rep1', status: 'pending', reporterId: 'victim1', targetId: 'target1' });
    p.playerReport.update.mockResolvedValue({});
    const res = await resolvePOST(req({ reportId: 'rep1' }));
    expect(res.status).toBe(200);
    expect(p.playerNotification.create).not.toHaveBeenCalled();
    expect(p.playerReport.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'dismissed' }),
    }));
  });
});

describe('POST /api/admin/moderation/revoke', () => {
  it('revokes an active sanction and audits it', async () => {
    p.sanction.findUnique.mockResolvedValue({ id: 'sanc1', userId: 'target1', type: 'mute_chat', revokedAt: null });
    p.sanction.update.mockResolvedValue({ id: 'sanc1', userId: 'target1' });
    const res = await revokePOST(req({ sanctionId: 'sanc1' }));
    expect(res.status).toBe(200);
    expect(p.sanction.update).toHaveBeenCalled();
    expect(p.adminAction.create).toHaveBeenCalledTimes(1);
  });

  it('refuses to revoke twice', async () => {
    p.sanction.findUnique.mockResolvedValue({ id: 'sanc1', userId: 'target1', type: 'mute_chat', revokedAt: new Date() });
    const res = await revokePOST(req({ sanctionId: 'sanc1' }));
    expect(res.status).toBe(409);
  });
});
