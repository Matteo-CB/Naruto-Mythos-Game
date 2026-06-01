import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { isSetAvailable } from '@/lib/data/sets/registry';
import {
  openBooster,
  NoBoosterError,
  UnknownUserError,
} from '@/lib/boosters/openBooster';
import { emitQuestEvent } from '@/lib/quests/hooks';
import { ensureQuestPersistenceListener } from '@/lib/quests/listenerSetup';

ensureQuestPersistenceListener();

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { setId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body', errorKey: 'boosters.error.invalidBody' }, { status: 400 });
  }
  const setId = typeof body.setId === 'string' ? body.setId : '';
  if (!setId) {
    return NextResponse.json({ error: 'setId is required', errorKey: 'boosters.error.setRequired' }, { status: 400 });
  }
  if (!isSetAvailable(setId)) {
    return NextResponse.json({ error: 'Set is not available', errorKey: 'boosters.error.setNotAvailable' }, { status: 400 });
  }

  try {
    const result = await openBooster(session.user.id, setId);
    emitQuestEvent('booster.opened', session.user.id, { setId });
    return NextResponse.json({
      cardIds: result.cards.map((c) => c.cardId),
      newCardIds: result.newCardIds,
      duplicateCardIds: result.duplicateCardIds,
      duplicateXpAwarded: result.duplicateXpAwarded,
      remainingInventory: result.remainingInventory,
    });
  } catch (err) {
    if (err instanceof NoBoosterError) {
      return NextResponse.json({ error: 'No booster available', errorKey: 'boosters.error.noBoosterAvailable' }, { status: 409 });
    }
    if (err instanceof UnknownUserError) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    console.error('[API /boosters/open]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error', errorKey: 'boosters.error.serverError' }, { status: 500 });
  }
}
