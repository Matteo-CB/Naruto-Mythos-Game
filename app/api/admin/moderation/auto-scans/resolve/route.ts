import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireModerator } from '@/lib/auth/adminGuard';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const mod = await requireModerator();
  if (!mod) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const scanId = typeof body.scanId === 'string' ? body.scanId : '';
  if (!scanId) return NextResponse.json({ error: 'Missing scanId' }, { status: 400 });

  try {
    await prisma.chatModerationScan.update({
      where: { id: scanId },
      data: { status: 'handled', handledByName: mod.username, handledAt: new Date() },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
