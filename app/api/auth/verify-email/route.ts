import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ errorKey: 'auth.error.verifyTokenInvalid' }, { status: 400 });
  }
  const token = typeof (body as { token?: unknown })?.token === 'string' ? (body as { token: string }).token : '';
  if (!token || token.length < 16) {
    return NextResponse.json({ errorKey: 'auth.error.verifyTokenInvalid' }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { emailVerifyToken: token } as never,
    select: { id: true, emailVerifyExpiry: true, emailVerified: true, username: true } as never,
  }) as { id: string; emailVerifyExpiry: Date | null; emailVerified: boolean; username: string } | null;

  if (!user) {
    return NextResponse.json({ errorKey: 'auth.error.verifyTokenInvalid' }, { status: 404 });
  }

  if (user.emailVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  if (user.emailVerifyExpiry && user.emailVerifyExpiry.getTime() < Date.now()) {
    return NextResponse.json({ errorKey: 'auth.error.verifyTokenExpired' }, { status: 410 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerifyToken: null, emailVerifyExpiry: null } as never,
  });

  return NextResponse.json({ ok: true, username: user.username });
}
