import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ errorKey: 'helpUs.suggestions.error.loginRequired' }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ errorKey: 'helpUs.suggestions.error.notFound' }, { status: 404 });
  }

  const suggestion = await prisma.suggestion.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!suggestion) {
    return NextResponse.json({ errorKey: 'helpUs.suggestions.error.notFound' }, { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { chatBanned: true, chatBanUntil: true },
  });
  const banExpired = user?.chatBanUntil ? user.chatBanUntil.getTime() < Date.now() : false;
  if (user?.chatBanned && !banExpired) {
    return NextResponse.json({ errorKey: 'helpUs.suggestions.error.banned' }, { status: 403 });
  }

  const existing = await prisma.suggestionVote.findUnique({
    where: { suggestionId_userId: { suggestionId: id, userId } },
    select: { id: true },
  });

  try {
    if (existing) {
      await prisma.$transaction([
        prisma.suggestionVote.delete({ where: { id: existing.id } }),
        prisma.suggestion.update({
          where: { id },
          data: { voteCount: { decrement: 1 } },
        }),
      ]);
    } else {
      await prisma.$transaction([
        prisma.suggestionVote.create({
          data: { suggestionId: id, userId },
        }),
        prisma.suggestion.update({
          where: { id },
          data: { voteCount: { increment: 1 } },
        }),
      ]);
    }
  } catch (e) {
    console.error('[suggestions/vote] transaction failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ errorKey: 'helpUs.suggestions.error.voteFailed' }, { status: 500 });
  }

  const refreshed = await prisma.suggestion.findUnique({
    where: { id },
    select: { voteCount: true },
  });

  return NextResponse.json({
    voteCount: refreshed?.voteCount ?? 0,
    hasVoted: !existing,
  });
}
