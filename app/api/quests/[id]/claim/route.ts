import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { getQuestById } from '@/lib/quests/questData';
import { QUEST_XP_BY_LEVEL } from '@/lib/battlepass/constants';
import { awardXp } from '@/lib/battlepass/awardXp';
import { formatDateUTC } from '@/lib/quests/dailySelector';
import { withUserLock } from '@/lib/quests/userLock';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: questId } = await params;
  const quest = getQuestById(questId);
  if (!quest) {
    return NextResponse.json({ error: 'Quest not found', errorKey: 'quests.error.notFound' }, { status: 404 });
  }

  const userId = session.user.id;

  return withUserLock(userId, async () => {
  try {
    const today = formatDateUTC(new Date());
    const dailyForSameQuest = await prisma.dailyQuestProgress.findUnique({
      where: { userId_date: { userId, date: today } },
      select: { questId: true, claimed: true },
    });
    if (dailyForSameQuest?.questId === questId && dailyForSameQuest.claimed) {
      return NextResponse.json({
        error: 'Already claimed via daily quest today',
        errorKey: 'quests.error.alreadyClaimedAsDaily',
      }, { status: 409 });
    }

    const claimResult = await prisma.questProgress.updateMany({
      where: { userId, questId, completed: true, claimed: false },
      data: { claimed: true, claimedAt: new Date() },
    });

    if (claimResult.count === 0) {
      const existing = await prisma.questProgress.findUnique({
        where: { userId_questId: { userId, questId } },
        select: { completed: true, claimed: true, progress: true },
      });
      if (!existing) {
        return NextResponse.json({ error: 'No progress for this quest', errorKey: 'quests.error.noProgress' }, { status: 400 });
      }
      if (!existing.completed) {
        return NextResponse.json({ error: 'Quest not completed yet', errorKey: 'quests.error.notCompleted' }, { status: 400 });
      }
      if (existing.claimed) {
        return NextResponse.json({ error: 'Already claimed', errorKey: 'quests.error.alreadyClaimed' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Cannot claim quest' }, { status: 400 });
    }

    const xp = QUEST_XP_BY_LEVEL[quest.level];
    const award = await awardXp(userId, xp);

    return NextResponse.json({
      questId,
      xpAwarded: xp,
      ...award,
    });
  } catch (err) {
    console.error('[API /quests/claim]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error', errorKey: 'quests.error.serverError' }, { status: 500 });
  }
  });
}
