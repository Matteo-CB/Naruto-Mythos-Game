import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  emailVerification: {
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue({}),
  },
  user: {
    updateMany: vi.fn(),
  },
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/mail/verificationCode', () => ({ sendVerificationCodeMail: vi.fn() }));

import { generateVerificationCode, hashVerificationCode, verifyEmailCode, CODE_TTL_MS, MAX_ATTEMPTS } from '@/lib/auth/emailVerification';

describe('email verification codes', () => {
  it('generates 6-digit zero-padded codes', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateVerificationCode()).toMatch(/^\d{6}$/);
    }
  });

  it('hashes deterministically and never stores the raw code', () => {
    const code = '042137';
    const h1 = hashVerificationCode(code);
    const h2 = hashVerificationCode(code);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toContain(code);
    expect(hashVerificationCode('042138')).not.toBe(h1);
  });

  it('exposes sane limits', () => {
    expect(CODE_TTL_MS).toBe(15 * 60 * 1000);
    expect(MAX_ATTEMPTS).toBe(5);
  });
});

describe('verifyEmailCode (regression: infinite verification loop)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks the user verified even when emailVerifiedAt is ABSENT on the document (not null)', async () => {
    const code = '123456';
    mockPrisma.emailVerification.findUnique.mockResolvedValue({
      email: 'a@a.com',
      codeHash: hashVerificationCode(code),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
    });
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });

    const result = await verifyEmailCode('a@a.com', code);

    expect(result).toBe('ok');
    const call = mockPrisma.user.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ email: 'a@a.com' });
    expect(call.where.emailVerifiedAt).toBeUndefined();
  });

  it('returns not_found (not a silent success) if no user document matched the email', async () => {
    const code = '123456';
    mockPrisma.emailVerification.findUnique.mockResolvedValue({
      email: 'ghost@a.com',
      codeHash: hashVerificationCode(code),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
    });
    mockPrisma.user.updateMany.mockResolvedValue({ count: 0 });

    const result = await verifyEmailCode('ghost@a.com', code);

    expect(result).toBe('not_found');
    expect(mockPrisma.emailVerification.delete).not.toHaveBeenCalled();
  });

  it('rejects a wrong code without touching the user', async () => {
    mockPrisma.emailVerification.findUnique.mockResolvedValue({
      email: 'a@a.com',
      codeHash: hashVerificationCode('123456'),
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
    });
    mockPrisma.emailVerification.update.mockResolvedValue({});

    const result = await verifyEmailCode('a@a.com', '000000');

    expect(result).toBe('invalid');
    expect(mockPrisma.user.updateMany).not.toHaveBeenCalled();
  });
});
