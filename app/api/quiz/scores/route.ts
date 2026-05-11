import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { gzipSync, gunzipSync } from 'zlib';

interface HistoryEntry {
  d: number;
  s: number;
  c: number;
  t: number;
  bs: number;
  at: number;
}

interface BestByDiff {
  [difficulty: string]: { score: number; correct: number; total: number; bestStreak: number; at: number };
}

const HISTORY_MAX = 50;

function packHistory(arr: HistoryEntry[]): Uint8Array<ArrayBuffer> {
  const json = JSON.stringify(arr);
  const gz = gzipSync(json, { level: 9 });
  const out = new Uint8Array(new ArrayBuffer(gz.byteLength));
  out.set(gz);
  return out;
}

function unpackHistory(buf: Buffer | Uint8Array | null | undefined): HistoryEntry[] {
  if (!buf) return [];
  try {
    const src = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    const json = gunzipSync(src).toString('utf8');
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter((e): e is HistoryEntry =>
      e && typeof e.d === 'number' && typeof e.s === 'number' && typeof e.c === 'number' && typeof e.t === 'number' && typeof e.bs === 'number' && typeof e.at === 'number',
    );
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { difficulty, score, correct, total, accuracy, bestStreak } = body;

    if (
      typeof difficulty !== 'number' || difficulty < 1 || difficulty > 5 ||
      typeof score !== 'number' || score < 0 || score > 1_000_000 ||
      typeof correct !== 'number' || correct < 0 ||
      typeof total !== 'number' || total < 1 || total > 500 ||
      typeof accuracy !== 'number' || accuracy < 0 || accuracy > 100 ||
      typeof bestStreak !== 'number' || bestStreak < 0
    ) {
      return NextResponse.json({ error: 'Invalid quiz score data' }, { status: 400 });
    }
    if (correct > total || bestStreak > correct) {
      return NextResponse.json({ error: 'Inconsistent quiz score data' }, { status: 400 });
    }

    const userId = session.user.id;
    const existing = await prisma.quizScore.findUnique({ where: { userId } });

    const now = Date.now();
    const newEntry: HistoryEntry = { d: difficulty, s: score, c: correct, t: total, bs: bestStreak, at: now };
    const history = unpackHistory(existing?.historyGz as Buffer | null | undefined);
    history.push(newEntry);
    history.sort((a, b) => b.at - a.at);
    while (history.length > HISTORY_MAX) history.pop();

    const bestByDiff: BestByDiff = (existing?.bestByDiff as unknown as BestByDiff | null) ?? {};
    const key = String(difficulty);
    const prevBest = bestByDiff[key];
    if (!prevBest || score > prevBest.score) {
      bestByDiff[key] = { score, correct, total, bestStreak, at: now };
    }

    const packed = packHistory(history);
    const data = {
      bestByDiff,
      totalRuns: (existing?.totalRuns ?? 0) + 1,
      totalCorrect: (existing?.totalCorrect ?? 0) + correct,
      totalQ: (existing?.totalQ ?? 0) + total,
      historyGz: packed,
    };

    const quizScore = await prisma.quizScore.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });

    return NextResponse.json({ quizScore: { id: quizScore.id, totalRuns: quizScore.totalRuns, bestByDiff } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
