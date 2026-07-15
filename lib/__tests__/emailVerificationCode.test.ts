import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/mail/verificationCode', () => ({ sendVerificationCodeMail: vi.fn() }));

import { generateVerificationCode, hashVerificationCode, CODE_TTL_MS, MAX_ATTEMPTS } from '@/lib/auth/emailVerification';

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
