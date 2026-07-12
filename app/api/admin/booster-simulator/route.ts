import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { isAdmin } from '@/lib/auth/admins';
import { rollVariantBooster, type RollMode } from '@/lib/variants/rollBooster';
import {
  VARIANT_PACK_PROBABILITIES,
  VARIANT_PACK_SIZE,
  VARIANT_RARITY_ROLL_ORDER,
  type PackSlotKind,
} from '@/lib/variants/constants';
import type { CardData } from '@/lib/engine/types';
import { isSetAvailable } from '@/lib/data/sets/registry';

type Mode = RollMode;

const VALID_COUNTS = new Set([1, 10, 100, 1000, 10000]);

interface SimResult {
  setId: string;
  mode: Mode;
  count: number;
  totalSlots: number;
  perRarityCounts: Record<PackSlotKind, number>;
  perRarityExpected: Record<PackSlotKind, number>;
  perRarityDeviationPct: Record<PackSlotKind, number>;
  perCardCounts: Array<{ cardId: string; count: number; rarity: PackSlotKind }>;
  sampleBoosterCardIds: string[];
}

function slotKindOf(card: CardData): PackSlotKind {
  if (card.isHolo) return card.rarity === 'C' ? 'HOLO_C' : 'HOLO_UC';
  return card.rarity as PackSlotKind;
}

function emptyKindRecord(): Record<PackSlotKind, number> {
  return { RA: 0, MV: 0, SV: 0, L: 0, HOLO_C: 0, HOLO_UC: 0 };
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, email: true },
  });
  if (!isAdmin({ username: me?.username, email: me?.email })) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { setId?: unknown; mode?: unknown; count?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body', errorKey: 'admin.booster.invalidBody' }, { status: 400 });
  }
  const setId = typeof body.setId === 'string' ? body.setId : '';
  const mode = (body.mode === 'normal' || body.mode === 'forceL' || body.mode === 'forceSV') ? body.mode : 'normal';
  const count = typeof body.count === 'number' ? Math.floor(body.count) : NaN;
  if (!setId || !isSetAvailable(setId)) {
    return NextResponse.json({ error: 'Set not available', errorKey: 'admin.booster.setNotAvailable' }, { status: 400 });
  }
  if (!VALID_COUNTS.has(count)) {
    return NextResponse.json({ error: 'Invalid count', errorKey: 'admin.booster.invalidCount' }, { status: 400 });
  }

  const perRarityCounts = emptyKindRecord();
  const perCardMap = new Map<string, { count: number; rarity: PackSlotKind }>();
  let sampleBoosterCardIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const slots = rollVariantBooster(setId, { mode });
    if (i === 0) sampleBoosterCardIds = slots.map((s) => s.id);
    for (const card of slots) {
      const k = slotKindOf(card);
      if (perRarityCounts[k] !== undefined) perRarityCounts[k] += 1;
      const e = perCardMap.get(card.id);
      if (e) e.count += 1;
      else perCardMap.set(card.id, { count: 1, rarity: k });
    }
  }

  const totalSlots = count * VARIANT_PACK_SIZE;

  const perRarityExpected = emptyKindRecord();
  if (mode === 'normal') {
    for (const k of VARIANT_RARITY_ROLL_ORDER) {
      perRarityExpected[k] = totalSlots * VARIANT_PACK_PROBABILITIES[k];
    }
  } else {
    const forcedRarity: PackSlotKind = mode === 'forceL' ? 'L' : 'SV';
    const remainingSlots = totalSlots - count;
    for (const k of VARIANT_RARITY_ROLL_ORDER) {
      perRarityExpected[k] = (k === forcedRarity ? count : 0) + remainingSlots * VARIANT_PACK_PROBABILITIES[k];
    }
  }

  const perRarityDeviationPct = emptyKindRecord();
  for (const k of VARIANT_RARITY_ROLL_ORDER) {
    const exp = perRarityExpected[k];
    if (exp > 0) {
      perRarityDeviationPct[k] = ((perRarityCounts[k] - exp) / exp) * 100;
    }
  }

  const perCardCounts = Array.from(perCardMap.entries())
    .map(([cardId, v]) => ({ cardId, count: v.count, rarity: v.rarity }))
    .sort((a, b) => b.count - a.count);

  const result: SimResult = {
    setId,
    mode,
    count,
    totalSlots,
    perRarityCounts,
    perRarityExpected,
    perRarityDeviationPct,
    perCardCounts,
    sampleBoosterCardIds,
  };

  return NextResponse.json(result);
}
