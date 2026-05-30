import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { emitQuestEvent } from '@/lib/quests/hooks';
import { ensureQuestPersistenceListener } from '@/lib/quests/listenerSetup';

ensureQuestPersistenceListener();

type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
type ResultKind = 'played' | 'won' | 'lost';

interface Body {
  difficulty?: unknown;
  result?: unknown;
  streak?: unknown;
  events?: unknown;
}

function isValidDifficulty(v: unknown): v is Difficulty {
  return v === 'easy' || v === 'medium' || v === 'hard' || v === 'expert';
}

function isValidResult(v: unknown): v is ResultKind {
  return v === 'played' || v === 'won' || v === 'lost';
}

const MAX_EVENTS = 500;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (!isValidDifficulty(body.difficulty)) {
    return NextResponse.json({ error: 'Invalid difficulty' }, { status: 400 });
  }
  if (!isValidResult(body.result)) {
    return NextResponse.json({ error: 'Invalid result' }, { status: 400 });
  }

  const difficulty = body.difficulty;
  const result = body.result;
  const streak = typeof body.streak === 'number' && body.streak > 0 ? Math.floor(body.streak) : 0;

  emitQuestEvent('match.played.ai', userId, { gameMode: 'ai', difficulty });
  if (result === 'won') {
    emitQuestEvent('match.won.ai', userId, { gameMode: 'ai', difficulty });
    if (streak >= 2) {
      emitQuestEvent('match.won.ai.streak', userId, { gameMode: 'ai', difficulty, streak });
    }
  }

  if (Array.isArray(body.events)) {
    const events = body.events.slice(0, MAX_EVENTS);
    for (const evt of events) {
      if (typeof evt?.hook !== 'string') continue;
      const payload = (evt.payload && typeof evt.payload === 'object') ? evt.payload as Record<string, unknown> : {};
      emitQuestEvent(evt.hook, userId, payload);
    }
  }

  return NextResponse.json({ ok: true });
}
