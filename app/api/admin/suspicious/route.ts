/**
 * Admin endpoint for the suspicious-activity review panel.
 *
 * GET  /api/admin/suspicious                 → list all findings
 * GET  /api/admin/suspicious?user=<id|name>  → findings involving that user
 * POST /api/admin/suspicious                 → action: { action: 'revert-elo', gameId }
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import {
  runAllHeuristics,
  runHeuristicsForUsers,
  revertGameElo,
} from '@/lib/admin/suspiciousDetection';

const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

async function requireAdmin(): Promise<Response | null> {
  const session = await auth();
  if (!session?.user?.name || !ADMIN_USERNAMES.includes(session.user.name)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function GET(request: Request) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const url = new URL(request.url);
  const filter = url.searchParams.get('user');

  try {
    if (!filter) {
      const findings = await runAllHeuristics();
      return NextResponse.json({ findings });
    }

    // Accept either a user id (Mongo ObjectId-looking) or a username substring.
    const looksLikeId = /^[0-9a-f]{24}$/i.test(filter);
    const users = await prisma.user.findMany({
      where: looksLikeId
        ? { id: filter }
        : { username: { contains: filter, mode: 'insensitive' } },
      select: { id: true, username: true },
    });
    const ids = users.map((u) => u.id);
    const findings = ids.length > 0 ? await runHeuristicsForUsers(ids) : [];
    return NextResponse.json({ findings, matchedUsers: users });
  } catch (err) {
    console.error('[admin/suspicious] GET error:', err);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  try {
    const body = await request.json();
    const { action, gameId } = body as { action?: string; gameId?: string };

    if (action === 'revert-elo') {
      if (!gameId) return NextResponse.json({ error: 'Missing gameId' }, { status: 400 });
      const res = await revertGameElo(gameId);
      return NextResponse.json(res, { status: res.ok ? 200 : 400 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[admin/suspicious] POST error:', err);
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
