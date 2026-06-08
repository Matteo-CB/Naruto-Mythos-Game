import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakeAuth = vi.fn();
vi.mock('@/lib/auth/authOptions', () => ({ auth: (...a: unknown[]) => fakeAuth(...a) }));

const findUnique = vi.fn();
const update = vi.fn();
const deleteSuggestion = vi.fn();

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    suggestion: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
      delete: (...a: unknown[]) => deleteSuggestion(...a),
    },
  },
}));

import { PATCH, DELETE } from '@/app/api/suggestions/[id]/route';

function patchReq(body: unknown): Request {
  return new Request('http://test/api/suggestions/abc', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteReq(): Request {
  return new Request('http://test/api/suggestions/abc', { method: 'DELETE' });
}

const adminSession = { user: { id: 'admin', name: 'Kutxyt', email: null } };
const nonAdminSession = { user: { id: 'normal', name: 'someone', email: 'someone@b.c' } };

beforeEach(() => {
  fakeAuth.mockReset();
  findUnique.mockReset();
  update.mockReset();
  deleteSuggestion.mockReset();
});

describe('PATCH /api/suggestions/[id]', () => {
  it('403 when not admin', async () => {
    fakeAuth.mockResolvedValue(nonAdminSession);
    const res = await PATCH(patchReq({ status: 'planned' }) as never, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(403);
  });

  it('403 when not authenticated', async () => {
    fakeAuth.mockResolvedValue(null);
    const res = await PATCH(patchReq({ status: 'planned' }) as never, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(403);
  });

  it('400 when no field to update', async () => {
    fakeAuth.mockResolvedValue(adminSession);
    const res = await PATCH(patchReq({}) as never, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(400);
  });

  it('400 when status is unknown', async () => {
    fakeAuth.mockResolvedValue(adminSession);
    const res = await PATCH(patchReq({ status: 'archived' }) as never, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(400);
  });

  it('404 when the suggestion does not exist', async () => {
    fakeAuth.mockResolvedValue(adminSession);
    findUnique.mockResolvedValue(null);
    const res = await PATCH(patchReq({ status: 'planned' }) as never, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(404);
  });

  it('sets closedAt when status becomes done', async () => {
    fakeAuth.mockResolvedValue(adminSession);
    findUnique.mockResolvedValue({ id: 'abc' });
    update.mockResolvedValue({
      id: 'abc', userId: 'u', username: 'u', category: 'bug', title: 't', body: 'b',
      status: 'done', voteCount: 0, adminNote: null,
      createdAt: new Date(), updatedAt: new Date(), closedAt: new Date(),
    });
    await PATCH(patchReq({ status: 'done' }) as never, { params: Promise.resolve({ id: 'abc' }) });
    const args = update.mock.calls[0][0] as { data: { status: string; closedAt: Date | null } };
    expect(args.data.status).toBe('done');
    expect(args.data.closedAt).toBeInstanceOf(Date);
  });

  it('clears closedAt when status moves back to open', async () => {
    fakeAuth.mockResolvedValue(adminSession);
    findUnique.mockResolvedValue({ id: 'abc' });
    update.mockResolvedValue({
      id: 'abc', userId: 'u', username: 'u', category: 'bug', title: 't', body: 'b',
      status: 'open', voteCount: 0, adminNote: null,
      createdAt: new Date(), updatedAt: new Date(), closedAt: null,
    });
    await PATCH(patchReq({ status: 'open' }) as never, { params: Promise.resolve({ id: 'abc' }) });
    const args = update.mock.calls[0][0] as { data: { status: string; closedAt: Date | null } };
    expect(args.data.closedAt).toBeNull();
  });

  it('accepts a new to_fix status (new status added in plan)', async () => {
    fakeAuth.mockResolvedValue(adminSession);
    findUnique.mockResolvedValue({ id: 'abc' });
    update.mockResolvedValue({
      id: 'abc', userId: 'u', username: 'u', category: 'bug', title: 't', body: 'b',
      status: 'to_fix', voteCount: 0, adminNote: null,
      createdAt: new Date(), updatedAt: new Date(), closedAt: null,
    });
    const res = await PATCH(patchReq({ status: 'to_fix' }) as never, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(200);
    const args = update.mock.calls[0][0] as { data: { status: string; closedAt: Date | null } };
    expect(args.data.status).toBe('to_fix');
    expect(args.data.closedAt).toBeNull();
  });

  it('saves adminNote (trimmed) and accepts empty string to clear', async () => {
    fakeAuth.mockResolvedValue(adminSession);
    findUnique.mockResolvedValue({ id: 'abc' });
    update.mockResolvedValue({
      id: 'abc', userId: 'u', username: 'u', category: 'bug', title: 't', body: 'b',
      status: 'open', voteCount: 0, adminNote: 'noted',
      createdAt: new Date(), updatedAt: new Date(), closedAt: null,
    });
    await PATCH(patchReq({ adminNote: '   noted   ' }) as never, { params: Promise.resolve({ id: 'abc' }) });
    expect((update.mock.calls[0][0] as { data: { adminNote: string } }).data.adminNote).toBe('noted');

    await PATCH(patchReq({ adminNote: '' }) as never, { params: Promise.resolve({ id: 'abc' }) });
    expect((update.mock.calls[1][0] as { data: { adminNote: string | null } }).data.adminNote).toBeNull();
  });
});

describe('DELETE /api/suggestions/[id]', () => {
  it('403 when not admin', async () => {
    fakeAuth.mockResolvedValue(nonAdminSession);
    const res = await DELETE(deleteReq() as never, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(403);
  });

  it('404 when suggestion does not exist', async () => {
    fakeAuth.mockResolvedValue(adminSession);
    findUnique.mockResolvedValue(null);
    const res = await DELETE(deleteReq() as never, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(404);
  });

  it('204 on successful delete (cascade handled by prisma)', async () => {
    fakeAuth.mockResolvedValue(adminSession);
    findUnique.mockResolvedValue({ id: 'abc' });
    deleteSuggestion.mockResolvedValue({});
    const res = await DELETE(deleteReq() as never, { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(204);
    expect(deleteSuggestion).toHaveBeenCalledWith({ where: { id: 'abc' } });
  });
});
