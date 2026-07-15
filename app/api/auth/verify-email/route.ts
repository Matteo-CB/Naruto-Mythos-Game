import { NextRequest, NextResponse } from 'next/server';
import { verifyEmailCode } from '@/lib/auth/emailVerification';

const verifyRate = new Map<string, number[]>();
const VERIFY_WINDOW_MS = 10 * 60 * 1000;
const VERIFY_MAX = 20;

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    const now = Date.now();
    const recent = (verifyRate.get(ip) ?? []).filter((t) => t > now - VERIFY_WINDOW_MS);
    if (recent.length >= VERIFY_MAX) {
      return NextResponse.json({ error: 'Too many attempts', errorKey: 'auth.error.tooManyAttempts' }, { status: 429 });
    }
    recent.push(now);
    verifyRate.set(ip, recent);

    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!email || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Invalid code', errorKey: 'auth.error.codeInvalid' }, { status: 400 });
    }

    const result = await verifyEmailCode(email, code);
    if (result === 'ok') return NextResponse.json({ ok: true });

    const keys: Record<string, { key: string; status: number }> = {
      invalid: { key: 'auth.error.codeInvalid', status: 400 },
      not_found: { key: 'auth.error.codeInvalid', status: 400 },
      expired: { key: 'auth.error.codeExpired', status: 400 },
      too_many_attempts: { key: 'auth.error.tooManyAttempts', status: 429 },
    };
    const mapped = keys[result];
    return NextResponse.json({ error: result, errorKey: mapped.key }, { status: mapped.status });
  } catch {
    return NextResponse.json({ error: 'Internal server error', errorKey: 'auth.error.serverError' }, { status: 500 });
  }
}
