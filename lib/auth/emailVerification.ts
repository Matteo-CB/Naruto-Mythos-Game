import { createHash, randomInt } from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { sendVerificationCodeMail } from '@/lib/mail/verificationCode';

export const CODE_TTL_MS = 15 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const MAX_SENDS = 8;

export function generateVerificationCode(): string {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

export function hashVerificationCode(code: string): string {
  return createHash('sha256').update(`nmv1:${code}`).digest('hex');
}

export type IssueResult = 'sent' | 'cooldown' | 'too_many_sends' | 'mail_failed';

export async function issueVerificationCode(email: string, locale: string): Promise<IssueResult> {
  const now = new Date();
  const existing = await prisma.emailVerification.findUnique({ where: { email } });

  if (existing) {
    if (now.getTime() - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS) return 'cooldown';
    if (existing.sentCount >= MAX_SENDS) return 'too_many_sends';
  }

  const code = generateVerificationCode();
  const codeHash = hashVerificationCode(code);
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS);

  await prisma.emailVerification.upsert({
    where: { email },
    create: { email, codeHash, expiresAt, attempts: 0, sentCount: 1, lastSentAt: now },
    update: { codeHash, expiresAt, attempts: 0, sentCount: { increment: 1 }, lastSentAt: now },
  });

  const mail = await sendVerificationCodeMail({ to: email, code, locale });
  if (!mail.ok) return 'mail_failed';
  return 'sent';
}

export type VerifyResult = 'ok' | 'invalid' | 'expired' | 'too_many_attempts' | 'not_found';

export async function verifyEmailCode(email: string, code: string): Promise<VerifyResult> {
  const row = await prisma.emailVerification.findUnique({ where: { email } });
  if (!row) return 'not_found';
  if (row.expiresAt.getTime() < Date.now()) return 'expired';
  if (row.attempts >= MAX_ATTEMPTS) return 'too_many_attempts';

  if (hashVerificationCode(code) !== row.codeHash) {
    await prisma.emailVerification.update({
      where: { email },
      data: { attempts: { increment: 1 } },
    });
    return row.attempts + 1 >= MAX_ATTEMPTS ? 'too_many_attempts' : 'invalid';
  }

  await prisma.user.updateMany({
    where: { email, emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date() },
  });
  await prisma.emailVerification.delete({ where: { email } }).catch(() => {});
  return 'ok';
}
