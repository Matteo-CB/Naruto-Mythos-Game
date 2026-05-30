import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { emitQuestEvent } from '@/lib/quests/hooks';
import { ensureQuestPersistenceListener } from '@/lib/quests/listenerSetup';

const ALLOWED_HOOKS: ReadonlySet<string> = new Set([
  'ui.deck_builder.opened',
  'ui.collection.opened',
  'ui.leaderboard.opened',
  'ui.profile.opened',
  'deck.exported',
]);

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  ensureQuestPersistenceListener();

  let body: { hook?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const hook = typeof body.hook === 'string' ? body.hook : '';
  if (!ALLOWED_HOOKS.has(hook)) {
    return NextResponse.json({ error: 'Unknown UI hook', hook }, { status: 400 });
  }

  emitQuestEvent(hook, session.user.id, {});

  return NextResponse.json({ ok: true, hook });
}
