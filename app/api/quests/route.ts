import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { QUESTS } from '@/lib/quests/questData';
import { QUEST_XP_BY_LEVEL } from '@/lib/battlepass/constants';
import { formatDateUTC } from '@/lib/quests/dailySelector';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const today = formatDateUTC(new Date());
  const [rows, dailyClaimed] = await Promise.all([
    prisma.questProgress.findMany({
      where: { userId },
      select: {
        questId: true,
        progress: true,
        target: true,
        completed: true,
        claimed: true,
        completedAt: true,
        claimedAt: true,
      },
    }),
    prisma.dailyQuestProgress.findUnique({
      where: { userId_date: { userId, date: today } },
      select: { questId: true, claimed: true },
    }),
  ]);
  const byId = new Map(rows.map((r) => [r.questId, r]));
  const dailyClaimedQuestId =
    dailyClaimed?.claimed === true ? dailyClaimed.questId : null;

  const quests = QUESTS.map((q) => {
    const row = byId.get(q.id);
    const claimedAsMain = row?.claimed ?? false;
    const claimedAsDailyToday = dailyClaimedQuestId === q.id;
    const claimed = claimedAsMain || claimedAsDailyToday;
    return {
      id: q.id,
      level: q.level,
      target: q.target,
      hook: q.hook,
      text_fr: q.text_fr,
      text_en: q.text_en,
      scope: q.scope,
      xpReward: QUEST_XP_BY_LEVEL[q.level],
      progress: row?.progress ?? 0,
      completed: row?.completed ?? false,
      claimed,
      claimedVia: claimedAsMain ? 'main' : claimedAsDailyToday ? 'daily' : null,
    };
  });

  return NextResponse.json({ quests });
}
