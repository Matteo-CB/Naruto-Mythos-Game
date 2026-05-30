import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { isAdmin } from '@/lib/auth/admins';
import { rollVariantBooster, type RollMode } from '@/lib/variants/rollBooster';
import {
  VARIANT_PACK_PROBABILITIES,
  VARIANT_PACK_SIZE,
  VARIANT_RARITIES,
  type VariantRarity,
} from '@/lib/variants/constants';
import { isSetAvailable } from '@/lib/data/sets/registry';

type Mode = RollMode;

const VALID_COUNTS = new Set([1, 10, 100, 1000, 10000]);

interface SimResult {
  setId: string;
  mode: Mode;
  count: number;
  totalSlots: number;
  perRarityCounts: Record<VariantRarity, number>;
  perRarityExpected: Record<VariantRarity, number>;
  perRarityDeviationPct: Record<VariantRarity, number>;
  perCardCounts: Array<{ cardId: string; count: number; rarity: VariantRarity }>;
  sampleBoosterCardIds: string[];
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

  const perRarityCounts: Record<VariantRarity, number> = { RA: 0, MV: 0, SV: 0, L: 0 };
  const perCardMap = new Map<string, { count: number; rarity: VariantRarity }>();
  let sampleBoosterCardIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const slots = rollVariantBooster(setId, { mode });
    if (i === 0) sampleBoosterCardIds = slots.map((s) => s.id);
    for (const card of slots) {
      const r = card.rarity as VariantRarity;
      if (perRarityCounts[r] !== undefined) perRarityCounts[r] += 1;
      const e = perCardMap.get(card.id);
      if (e) e.count += 1;
      else perCardMap.set(card.id, { count: 1, rarity: r });
    }
  }

  const totalSlots = count * VARIANT_PACK_SIZE;

  let perRarityExpected: Record<VariantRarity, number>;
  if (mode === 'normal') {
    perRarityExpected = {
      L: totalSlots * VARIANT_PACK_PROBABILITIES.L,
      SV: totalSlots * VARIANT_PACK_PROBABILITIES.SV,
      MV: totalSlots * VARIANT_PACK_PROBABILITIES.MV,
      RA: totalSlots * VARIANT_PACK_PROBABILITIES.RA,
    };
  } else {
    const forcedRarity: VariantRarity = mode === 'forceL' ? 'L' : 'SV';
    const remainingSlots = totalSlots - count;
    perRarityExpected = {
      L: count * (forcedRarity === 'L' ? 1 : 0) + remainingSlots * VARIANT_PACK_PROBABILITIES.L,
      SV: count * (forcedRarity === 'SV' ? 1 : 0) + remainingSlots * VARIANT_PACK_PROBABILITIES.SV,
      MV: remainingSlots * VARIANT_PACK_PROBABILITIES.MV,
      RA: remainingSlots * VARIANT_PACK_PROBABILITIES.RA,
    };
  }

  const perRarityDeviationPct: Record<VariantRarity, number> = { RA: 0, MV: 0, SV: 0, L: 0 };
  for (const r of VARIANT_RARITIES) {
    const exp = perRarityExpected[r];
    if (exp > 0) {
      perRarityDeviationPct[r] = ((perRarityCounts[r] - exp) / exp) * 100;
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
