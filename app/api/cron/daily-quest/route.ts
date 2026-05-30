import { NextRequest, NextResponse } from 'next/server';
import { ensureTodaysDailyQuest } from '@/lib/quests/dailyAssignment';
import { getIO } from '@/lib/socket/io';

function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!provided) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

async function handle(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await ensureTodaysDailyQuest();
    try {
      const io = getIO();
      if (io && result.created) {
        io.emit('daily-quest:rotated', { date: result.date, questId: result.quest.id });
      }
    } catch (err) {
      console.error('[cron/daily-quest] broadcast failed:', err instanceof Error ? err.message : err);
    }
    return NextResponse.json({
      ok: true,
      date: result.date,
      questId: result.quest.id,
      level: result.quest.level,
      created: result.created,
    });
  } catch (err) {
    console.error('[cron/daily-quest] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}
