import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { sendResetEmail } from '@/lib/email/sendResetEmail';

const resetRate = new Map<string, number[]>();
const RESET_WINDOW_MS = 15 * 60 * 1000;
const RESET_MAX = 3;

export async function POST(request: NextRequest) {
  try {
    const { email, locale } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const now = Date.now();
    const windowStart = now - RESET_WINDOW_MS;
    const recent = (resetRate.get(normalizedEmail) ?? []).filter((t) => t > windowStart);
    if (recent.length >= RESET_MAX) {
      return NextResponse.json({ success: true });
    }
    recent.push(now);
    resetRate.set(normalizedEmail, recent);
    if (resetRate.size > 5000) {
      for (const [k, ts] of resetRate) {
        if (ts.length === 0 || ts[ts.length - 1] < windowStart) resetRate.delete(k);
      }
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json({ success: true });
    }

    
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashedToken,
        resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    
    await sendResetEmail(email, rawToken, locale || 'en');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
