import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { isAdmin } from '@/lib/auth/admins';
import { getExtraRawCards, getExtraEffectDescriptions } from '@/lib/data/serverCards';
import { getSetStatus, getSetStatusOverrides } from '@/lib/data/sets/registry';
import { getVariantObtentionOverrides } from '@/lib/variants/obtention';
import { getHiddenCardIds, revealsEverything } from '@/lib/cards/reveal';
import { ensureSetConfigLoaded } from '@/lib/data/setConfigServer';

export const dynamic = 'force-dynamic';

// Delivers server-locked (not-in-bundle) set cards to the client at runtime, plus the admin
// set-status / variant-obtention config so the client registry mirrors the server:
//  - a set flipped 'available' delivers all its cards to everyone (fully public),
//  - a 'revealing' set delivers revealed cards to everyone, all cards only to admins/testers,
//  - a 'coming_soon' set delivers nothing.
// Unrevealed revealing-set card data thus never reaches a non-privileged client.
export async function GET() {
  await ensureSetConfigLoaded();
  const session = await auth().catch(() => null);
  let privileged = revealsEverything();
  if (session?.user?.id) {
    const admin = isAdmin({ username: session.user.name, email: session.user.email });
    if (admin) {
      privileged = true;
    } else {
      const dbUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
      privileged = dbUser?.role === 'tester';
    }
  }

  const hidden = await getHiddenCardIds();
  const toutRevele = revealsEverything();
  const extra = getExtraRawCards();
  const extraDesc = getExtraEffectDescriptions();

  const cards: Record<string, unknown> = {};
  const deliveredIds = new Set<string>();
  const deliveredHiddenIds = new Set<string>();
  for (const [id, raw] of Object.entries(extra)) {
    const setId = (raw as { set?: string }).set;
    if (!setId) continue;
    const status = getSetStatus(setId);
    let deliver = false;
    if (toutRevele) {
      deliver = true;
    } else if (status === 'available') {
      deliver = true;
    } else if (status === 'revealing') {
      // Revealing-set cards are public by default; hidden ones go to privileged viewers only.
      const isHidden = hidden.has(id);
      deliver = privileged || !isHidden;
      if (deliver && isHidden) deliveredHiddenIds.add(id);
    }
    if (deliver) {
      const src = raw as Record<string, unknown>;
      cards[id] = { ...src, image_file: `/api/card-image/${id}`, image_url: '' };
      deliveredIds.add(id);
    }
  }

  const descriptions: Record<string, Record<string, string[]>> = {};
  for (const [locale, map] of Object.entries(extraDesc)) {
    const filtered: Record<string, string[]> = {};
    for (const id of deliveredIds) {
      if (map[id]) filtered[id] = map[id];
    }
    descriptions[locale] = filtered;
  }

  const unrevealedIds = toutRevele ? [] : [...deliveredHiddenIds];

  return NextResponse.json({
    cards,
    descriptions,
    privileged,
    unrevealedIds,
    setStatuses: getSetStatusOverrides(),
    variantObtention: getVariantObtentionOverrides(),
  });
}
