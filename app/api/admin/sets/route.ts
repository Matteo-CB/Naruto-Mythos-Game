import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { prisma } from '@/lib/db/prisma';
import { getServerAllCards } from '@/lib/data/serverCards';
import { SET_REGISTRY, ALL_SET_IDS, getSetStatus, type SetStatus } from '@/lib/data/sets/registry';
import { getVariantObtentionMode, type ObtentionMode } from '@/lib/variants/obtention';
import { isVariantCard } from '@/lib/variants/isVariant';
import { ensureSetConfigLoaded, reloadSetConfig } from '@/lib/data/setConfigServer';

export const dynamic = 'force-dynamic';

const VALID_STATUS: SetStatus[] = ['available', 'revealing', 'coming_soon'];
const VALID_MODE: ObtentionMode[] = ['booster', 'reserved', 'locked'];

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await ensureSetConfigLoaded();

  const sets = ALL_SET_IDS.map((id) => ({
    id,
    number: SET_REGISTRY[id].number,
    nameEn: SET_REGISTRY[id].nameEn,
    nameFr: SET_REGISTRY[id].nameFr,
    defaultStatus: SET_REGISTRY[id].status,
    status: getSetStatus(id),
  })).sort((a, b) => a.number - b.number);

  const variants = getServerAllCards()
    .filter((c) => isVariantCard(c))
    .map((c) => ({
      id: c.id,
      set: c.set,
      number: c.number,
      rarity: c.rarity,
      name: c.name_en ?? c.name_fr ?? c.id,
      mode: getVariantObtentionMode(c.id),
    }))
    .sort((a, b) => a.set.localeCompare(b.set) || a.number - b.number || a.rarity.localeCompare(b.rarity));

  return NextResponse.json({ sets, variants });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const existing = await prisma.siteSettings.findUnique({
    where: { key: 'global' },
    select: { setStatusOverrides: true, variantObtentionConfig: true },
  });

  if (body.setStatus) {
    const { setId, status } = body.setStatus;
    if (!SET_REGISTRY[setId] || !VALID_STATUS.includes(status)) {
      return NextResponse.json({ error: 'Invalid set status' }, { status: 400 });
    }
    const map = { ...((existing?.setStatusOverrides ?? {}) as Record<string, string>) };
    if (status === SET_REGISTRY[setId].status) delete map[setId];
    else map[setId] = status;
    await prisma.siteSettings.upsert({
      where: { key: 'global' },
      update: { setStatusOverrides: map },
      create: { key: 'global', setStatusOverrides: map },
    });
    await reloadSetConfig();
    return NextResponse.json({ success: true });
  }

  if (body.obtention) {
    const { cardId, mode } = body.obtention;
    if (typeof cardId !== 'string' || !VALID_MODE.includes(mode)) {
      return NextResponse.json({ error: 'Invalid obtention' }, { status: 400 });
    }
    const map = { ...((existing?.variantObtentionConfig ?? {}) as Record<string, string>) };
    map[cardId] = mode;
    await prisma.siteSettings.upsert({
      where: { key: 'global' },
      update: { variantObtentionConfig: map },
      create: { key: 'global', variantObtentionConfig: map },
    });
    await reloadSetConfig();
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
}
