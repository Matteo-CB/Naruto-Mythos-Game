import { prisma } from '@/lib/db/prisma';
import { matchQuestsForEvent } from './trackProgress';
import type { QuestEventPayload, GameMode } from './hooks';
import type { Quest } from './questData';
import { formatDateUTC } from './dailySelector';
import { ensureDailyQuestForDate } from './dailyAssignment';
import { withUserLock } from './userLock';

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  return (err as { code?: string }).code === 'P2002';
}

interface ScopedAccumulator {
  scopeKey: string;
  progress: number;
}

const scopedProgress = new Map<string, ScopedAccumulator>();

function scopeMapKey(userId: string, questId: string): string {
  return `${userId}:${questId}`;
}

function currentSessionKey(): string {
  return formatDateUTC(new Date());
}

function scopeKeyForQuest(quest: Quest, payload: QuestEventPayload | undefined): string | null {
  if (quest.scope === 'match') {
    const m = payload?.matchKey;
    return typeof m === 'string' && m.length > 0 ? `match:${m}` : null;
  }
  if (quest.scope === 'session') {
    return `session:${currentSessionKey()}`;
  }
  return null;
}

export function __resetScopedProgressForTests(): void {
  scopedProgress.clear();
}

export interface PersistedProgress {
  questId: string;
  newProgress: number;
  completedNow: boolean;
}

const PERSISTING_MODES: ReadonlySet<GameMode> = new Set<GameMode>([
  'ranked',
  'casual',
  'evolving',
  'sealed',
  'tournament',
]);

function shouldPersist(hook: string, payload: QuestEventPayload | undefined): boolean {
  const mode = payload?.gameMode as GameMode | undefined;
  if (mode === undefined) return true;
  if (PERSISTING_MODES.has(mode)) return true;
  if (mode === 'ai' && (hook === 'match.played.ai' || hook.startsWith('match.won.ai'))) {
    return true;
  }
  if (mode === 'solo_v_self') return true;
  return false;
}

export async function persistQuestProgress(
  hook: string,
  userId: string,
  payload?: QuestEventPayload,
): Promise<PersistedProgress[]> {
  if (!userId) return [];
  if (!shouldPersist(hook, payload)) return [];

  const matches = matchQuestsForEvent(hook, payload);
  if (matches.length === 0) return [];

  return withUserLock(userId, async () => {
    const persisted: PersistedProgress[] = [];

    for (const { quest, delta } of matches) {
      const updated = await upsertQuestProgress(userId, quest, delta, payload);
      if (updated) persisted.push(updated);
    }

    if (hook === 'daily_quest.completed') return persisted;

    const dailyMatch = await matchTodayDaily(hook, payload);
    if (dailyMatch) {
      const dailyUpdated = await upsertDailyQuestProgress(userId, dailyMatch.quest, dailyMatch.delta, payload);
      if (dailyUpdated) persisted.push(dailyUpdated);
    }

    return persisted;
  });
}

async function upsertQuestProgress(
  userId: string,
  quest: Quest,
  delta: number,
  payload: QuestEventPayload | undefined,
): Promise<PersistedProgress | null> {
  const existing = await prisma.questProgress.findUnique({
    where: { userId_questId: { userId, questId: quest.id } },
  });

  if (existing?.claimed) return null;
  if (existing?.completed) {
    return { questId: quest.id, newProgress: existing.progress, completedNow: false };
  }

  const isScoped = quest.scope === 'match' || quest.scope === 'session';
  let effectiveProgress: number;
  if (isScoped) {
    const sKey = scopeKeyForQuest(quest, payload);
    if (!sKey) return null;
    const mapKey = scopeMapKey(userId, quest.id);
    const acc = scopedProgress.get(mapKey);
    if (!acc || acc.scopeKey !== sKey) {
      scopedProgress.set(mapKey, { scopeKey: sKey, progress: delta });
      effectiveProgress = delta;
    } else {
      acc.progress += delta;
      effectiveProgress = acc.progress;
    }
    if (effectiveProgress < quest.target) {
      return { questId: quest.id, newProgress: effectiveProgress, completedNow: false };
    }
  } else {
    effectiveProgress = (existing?.progress ?? 0) + delta;
  }

  const newProgress = Math.min(effectiveProgress, quest.target);
  const completed = newProgress >= quest.target;

  if (!existing) {
    try {
      await prisma.questProgress.create({
        data: {
          userId,
          questId: quest.id,
          progress: newProgress,
          target: quest.target,
          completed,
          completedAt: completed ? new Date() : null,
        },
      });
      return { questId: quest.id, newProgress, completedNow: completed };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      return mergeQuestProgressAfterRace(userId, quest, delta, isScoped, newProgress);
    }
  }

  const completedNow = completed && !existing.completed;
  await prisma.questProgress.update({
    where: { userId_questId: { userId, questId: quest.id } },
    data: {
      progress: newProgress,
      completed: completed ? true : existing.completed,
      completedAt: completedNow ? new Date() : existing.completedAt,
    },
  });
  return { questId: quest.id, newProgress, completedNow };
}

async function mergeQuestProgressAfterRace(
  userId: string,
  quest: Quest,
  delta: number,
  isScoped: boolean,
  attemptedProgress: number,
): Promise<PersistedProgress | null> {
  const row = await prisma.questProgress.findUnique({
    where: { userId_questId: { userId, questId: quest.id } },
  });
  if (!row) return null;
  if (row.claimed) return null;
  const merged = Math.min(
    isScoped ? Math.max(row.progress, attemptedProgress) : row.progress + delta,
    quest.target,
  );
  const completed = merged >= quest.target;
  const completedNow = completed && !row.completed;
  await prisma.questProgress.update({
    where: { userId_questId: { userId, questId: quest.id } },
    data: {
      progress: merged,
      completed: completed ? true : row.completed,
      completedAt: completedNow ? new Date() : row.completedAt,
    },
  });
  return { questId: quest.id, newProgress: merged, completedNow };
}

async function mergeDailyQuestProgressAfterRace(
  userId: string,
  date: string,
  quest: Quest,
  delta: number,
  isScoped: boolean,
  attemptedProgress: number,
): Promise<PersistedProgress | null> {
  const row = await prisma.dailyQuestProgress.findUnique({
    where: { userId_date: { userId, date } },
  });
  if (!row) return null;
  if (row.claimed) return null;
  if (row.questId !== quest.id) {
    return { questId: `daily:${quest.id}`, newProgress: row.progress, completedNow: false };
  }
  const merged = Math.min(
    isScoped ? Math.max(row.progress, attemptedProgress) : row.progress + delta,
    quest.target,
  );
  const completed = merged >= quest.target;
  const completedNow = completed && !row.completed;
  await prisma.dailyQuestProgress.update({
    where: { userId_date: { userId, date } },
    data: {
      progress: merged,
      completed: completed ? true : row.completed,
      completedAt: completedNow ? new Date() : row.completedAt,
    },
  });
  return { questId: `daily:${quest.id}`, newProgress: merged, completedNow };
}

async function matchTodayDaily(
  hook: string,
  payload: QuestEventPayload | undefined,
): Promise<{ quest: Quest; delta: number } | null> {
  const date = formatDateUTC(new Date());
  let questId: string | undefined;
  const existing = await prisma.dailyQuestAssignment.findUnique({ where: { date } });
  if (existing) {
    questId = existing.questId;
  } else {
    try {
      const ensured = await ensureDailyQuestForDate(date);
      questId = ensured.quest.id;
    } catch {
      return null;
    }
  }
  const matches = matchQuestsForEvent(hook, payload);
  const match = matches.find((m) => m.quest.id === questId);
  return match ?? null;
}

async function upsertDailyQuestProgress(
  userId: string,
  quest: Quest,
  delta: number,
  payload: QuestEventPayload | undefined,
): Promise<PersistedProgress | null> {
  const date = formatDateUTC(new Date());
  const existing = await prisma.dailyQuestProgress.findUnique({
    where: { userId_date: { userId, date } },
  });

  if (existing?.claimed) return null;
  if (existing?.completed) {
    return { questId: `daily:${quest.id}`, newProgress: existing.progress, completedNow: false };
  }
  if (existing && existing.questId !== quest.id) {
    return { questId: `daily:${quest.id}`, newProgress: existing.progress, completedNow: false };
  }

  const isScoped = quest.scope === 'match' || quest.scope === 'session';
  let effectiveProgress: number;
  if (isScoped) {
    const sKey = scopeKeyForQuest(quest, payload);
    if (!sKey) return null;
    const mapKey = `daily:${userId}:${quest.id}:${date}`;
    const acc = scopedProgress.get(mapKey);
    if (!acc || acc.scopeKey !== sKey) {
      scopedProgress.set(mapKey, { scopeKey: sKey, progress: delta });
      effectiveProgress = delta;
    } else {
      acc.progress += delta;
      effectiveProgress = acc.progress;
    }
    if (effectiveProgress < quest.target) {
      return { questId: `daily:${quest.id}`, newProgress: effectiveProgress, completedNow: false };
    }
  } else {
    effectiveProgress = (existing?.progress ?? 0) + delta;
  }

  const newProgress = Math.min(effectiveProgress, quest.target);
  const completed = newProgress >= quest.target;

  if (!existing) {
    try {
      await prisma.dailyQuestProgress.create({
        data: {
          userId,
          date,
          questId: quest.id,
          progress: newProgress,
          target: quest.target,
          completed,
          completedAt: completed ? new Date() : null,
        },
      });
      return { questId: `daily:${quest.id}`, newProgress, completedNow: completed };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      return mergeDailyQuestProgressAfterRace(userId, date, quest, delta, isScoped, newProgress);
    }
  }

  const completedNow = completed && !existing.completed;
  await prisma.dailyQuestProgress.update({
    where: { userId_date: { userId, date } },
    data: {
      progress: newProgress,
      completed: completed ? true : existing.completed,
      completedAt: completedNow ? new Date() : existing.completedAt,
    },
  });
  return { questId: `daily:${quest.id}`, newProgress, completedNow };
}
