import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { isAdminUsername } from '@/lib/auth/admins';
import { ensureDailyQuestForDate, ensureTodaysDailyQuest } from '@/lib/quests/dailyAssignment';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!isAdminUsername(session?.user?.name)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let dateOverride: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body?.date === 'string' && DATE_REGEX.test(body.date)) {
      dateOverride = body.date;
    } else if (body?.date !== undefined) {
      return NextResponse.json({ error: 'Invalid date format, expected YYYY-MM-DD' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  try {
    const result = dateOverride
      ? await ensureDailyQuestForDate(dateOverride)
      : await ensureTodaysDailyQuest();
    return NextResponse.json({
      date: result.date,
      questId: result.quest.id,
      text_fr: result.quest.text_fr,
      text_en: result.quest.text_en,
      level: result.quest.level,
      created: result.created,
    });
  } catch (err) {
    console.error('[admin/quests/rotate-daily] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
