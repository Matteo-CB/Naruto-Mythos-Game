import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { getInventoryForUser } from '@/lib/boosters/openBooster';
import { ALL_SET_IDS, SET_REGISTRY } from '@/lib/data/sets/registry';
import { hasAnyVariantsForSet } from '@/lib/variants/variantPool';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await getInventoryForUser(session.user.id);
  const map = new Map(rows.map((r) => [r.setId, r.count]));

  const inventory = ALL_SET_IDS.map((setId) => {
    const desc = SET_REGISTRY[setId];
    return {
      setId,
      count: map.get(setId) ?? 0,
      status: desc.status,
      nameEn: desc.nameEn,
      nameFr: desc.nameFr,
      boosterImage: desc.boosterImage,
      hasVariants: hasAnyVariantsForSet(setId),
    };
  });

  const totalUnopened = inventory.reduce((sum, b) => sum + b.count, 0);

  return NextResponse.json({ inventory, totalUnopened });
}
