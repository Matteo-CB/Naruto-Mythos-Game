import { prisma } from '@/lib/db/prisma';
import { formatDateUTC, pickDailyQuest } from './dailySelector';
import { getQuestById, type Quest } from './questData';

const RECENT_WINDOW_DAYS = 7;

export interface EnsureDailyQuestResult {
  date: string;
  quest: Quest;
  created: boolean;
}

export async function ensureDailyQuestForDate(date: string): Promise<EnsureDailyQuestResult> {
  const existing = await prisma.dailyQuestAssignment.findUnique({ where: { date } });
  if (existing) {
    const quest = getQuestById(existing.questId);
    if (!quest) {
      throw new Error(`ensureDailyQuestForDate: stale assignment for ${date} → unknown questId ${existing.questId}`);
    }
    return { date, quest, created: false };
  }

  const lookback = new Date(`${date}T00:00:00Z`);
  lookback.setUTCDate(lookback.getUTCDate() - RECENT_WINDOW_DAYS);
  const recent = await prisma.dailyQuestAssignment.findMany({
    where: { date: { gte: formatDateUTC(lookback), lt: date } },
    select: { questId: true },
  });
  const recentIds = recent.map((r) => r.questId);

  const quest = pickDailyQuest(date, recentIds);

  try {
    await prisma.dailyQuestAssignment.create({ data: { date, questId: quest.id } });
    return { date, quest, created: true };
  } catch (err) {
    const winner = await prisma.dailyQuestAssignment.findUnique({ where: { date } });
    if (winner) {
      const q = getQuestById(winner.questId);
      if (q) return { date, quest: q, created: false };
    }
    throw err;
  }
}

export async function ensureTodaysDailyQuest(now: Date = new Date()): Promise<EnsureDailyQuestResult> {
  return ensureDailyQuestForDate(formatDateUTC(now));
}
