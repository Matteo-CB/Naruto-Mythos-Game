import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { ensureTodaysDailyQuest } from '@/lib/quests/dailyAssignment';
import { getQuestById } from '@/lib/quests/questData';
import { QUEST_XP_BY_LEVEL } from '@/lib/battlepass/constants';
import { awardXp } from '@/lib/battlepass/awardXp';
import { formatDateUTC } from '@/lib/quests/dailySelector';
import { emitQuestEvent } from '@/lib/quests/hooks';
import { ensureQuestPersistenceListener } from '@/lib/quests/listenerSetup';
import { withUserLock } from '@/lib/quests/userLock';

ensureQuestPersistenceListener();

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const { date, quest } = await ensureTodaysDailyQuest();
  const [progressRow, mainRow] = await Promise.all([
    prisma.dailyQuestProgress.findUnique({
      where: { userId_date: { userId, date } },
      select: { progress: true, target: true, completed: true, claimed: true, questId: true },
    }),
    prisma.questProgress.findUnique({
      where: { userId_questId: { userId, questId: quest.id } },
      select: { claimed: true },
    }),
  ]);

  const synced =
    progressRow && progressRow.questId === quest.id
      ? progressRow
      : { progress: 0, target: quest.target, completed: false, claimed: false, questId: quest.id };

  const claimedViaMain = !!mainRow?.claimed && !synced.claimed;
  const claimed = synced.claimed || claimedViaMain;

  return NextResponse.json({
    date,
    quest: {
      id: quest.id,
      level: quest.level,
      target: quest.target,
      text_fr: quest.text_fr,
      text_en: quest.text_en,
      text_es: quest.text_es,
      text_ja: quest.text_ja,
      text_pt: quest.text_pt,
      text_it: quest.text_it,
      text_pl: quest.text_pl,
      xpReward: QUEST_XP_BY_LEVEL[quest.level],
    },
    progress: synced.progress,
    completed: synced.completed,
    claimed,
    claimedVia: synced.claimed ? 'daily' : claimedViaMain ? 'main' : null,
  });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;
  const date = formatDateUTC(new Date());

  return withUserLock(userId, async () => {
  const existingDaily = await prisma.dailyQuestProgress.findUnique({
    where: { userId_date: { userId, date } },
    select: { questId: true },
  });
  if (existingDaily) {
    const mainProgress = await prisma.questProgress.findUnique({
      where: { userId_questId: { userId, questId: existingDaily.questId } },
      select: { claimed: true },
    });
    if (mainProgress?.claimed) {
      return NextResponse.json({
        error: 'Already claimed via main quest',
        errorKey: 'quests.error.alreadyClaimedAsMain',
      }, { status: 409 });
    }
  }

  const claimResult = await prisma.dailyQuestProgress.updateMany({
    where: { userId, date, completed: true, claimed: false },
    data: { claimed: true, claimedAt: new Date() },
  });

  if (claimResult.count === 0) {
    const existing = await prisma.dailyQuestProgress.findUnique({
      where: { userId_date: { userId, date } },
      select: { completed: true, claimed: true, questId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'No daily quest progress', errorKey: 'quests.error.noProgress' }, { status: 400 });
    }
    if (!existing.completed) {
      return NextResponse.json({ error: 'Daily quest not completed yet', errorKey: 'quests.error.notCompleted' }, { status: 400 });
    }
    if (existing.claimed) {
      return NextResponse.json({ error: 'Already claimed today', errorKey: 'quests.error.alreadyClaimed' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Cannot claim daily quest' }, { status: 400 });
  }

  const updated = await prisma.dailyQuestProgress.findUnique({
    where: { userId_date: { userId, date } },
    select: { questId: true },
  });
  if (!updated) {
    return NextResponse.json({ error: 'Internal' }, { status: 500 });
  }
  const quest = getQuestById(updated.questId);
  if (!quest) {
    return NextResponse.json({ error: 'Stale quest id' }, { status: 500 });
  }

  const xp = QUEST_XP_BY_LEVEL[quest.level];
  const award = await awardXp(userId, xp);

  emitQuestEvent('daily_quest.completed', userId, { questId: quest.id });

  return NextResponse.json({
    date,
    questId: quest.id,
    xpAwarded: xp,
    ...award,
  });
  });
}
