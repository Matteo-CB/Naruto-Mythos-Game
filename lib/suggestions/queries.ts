import { prisma } from '@/lib/db/prisma';
import {
  MAX_OPEN_PER_USER,
  RATE_LIMIT_WINDOW_MS,
  type SuggestionCategory,
  type SuggestionStatus,
} from './validation';

export interface UserGate {
  banned: boolean;
  tooManyOpen: boolean;
  rateLimited: boolean;
  retryAfterMs: number;
}

export async function checkUserCanCreate(userId: string, now: number = Date.now()): Promise<UserGate> {
  const [user, openCount, latest] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { chatBanned: true, chatBanUntil: true },
    }),
    prisma.suggestion.count({
      where: { userId, status: 'open' },
    }),
    prisma.suggestion.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);

  const banExpired = user?.chatBanUntil ? user.chatBanUntil.getTime() < now : false;
  const banned = !!user?.chatBanned && !banExpired;

  const tooManyOpen = openCount >= MAX_OPEN_PER_USER;

  const sinceLast = latest ? now - latest.createdAt.getTime() : Number.POSITIVE_INFINITY;
  const rateLimited = sinceLast < RATE_LIMIT_WINDOW_MS;
  const retryAfterMs = rateLimited ? RATE_LIMIT_WINDOW_MS - sinceLast : 0;

  return { banned, tooManyOpen, rateLimited, retryAfterMs };
}

export type SortOption = 'votes' | 'recent' | 'status';

export interface ListQueryOptions {
  category?: SuggestionCategory | null;
  status?: SuggestionStatus | null;
  sort?: SortOption;
  q?: string | null;
  cursor?: string | null;
  limit?: number;
}

export function buildSuggestionWhere(opts: ListQueryOptions) {
  const where: Record<string, unknown> = {};
  if (opts.category) where.category = opts.category;
  if (opts.status) where.status = opts.status;
  if (opts.q && opts.q.trim().length > 0) {
    const q = opts.q.trim().slice(0, 80);
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { body: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

const STATUS_ORDER: SuggestionStatus[] = ['open', 'planned', 'in_progress', 'to_fix', 'done', 'rejected'];

export function compareByStatus(a: { status: string; voteCount: number; createdAt: Date }, b: { status: string; voteCount: number; createdAt: Date }) {
  const aIdx = STATUS_ORDER.indexOf(a.status as SuggestionStatus);
  const bIdx = STATUS_ORDER.indexOf(b.status as SuggestionStatus);
  if (aIdx !== bIdx) return aIdx - bIdx;
  if (a.voteCount !== b.voteCount) return b.voteCount - a.voteCount;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

export async function getTotalsByStatus(): Promise<Record<SuggestionStatus, number>> {
  const groups = await prisma.suggestion.groupBy({
    by: ['status'],
    _count: { _all: true },
  });
  const out: Record<SuggestionStatus, number> = {
    open: 0,
    planned: 0,
    in_progress: 0,
    to_fix: 0,
    done: 0,
    rejected: 0,
  };
  for (const g of groups) {
    if (g.status in out) {
      out[g.status as SuggestionStatus] = g._count._all;
    }
  }
  return out;
}
