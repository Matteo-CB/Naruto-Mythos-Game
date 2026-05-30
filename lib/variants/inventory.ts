import { prisma } from '@/lib/db/prisma';

export async function getVariantInventory(userId: string): Promise<Record<string, number>> {
  const rows = await prisma.variantInventory.findMany({
    where: { userId },
    select: { cardId: true, count: true },
  });
  const inv: Record<string, number> = {};
  for (const r of rows) {
    if (r.count > 0) inv[r.cardId] = r.count;
  }
  return inv;
}

export async function getVariantCount(userId: string, cardId: string): Promise<number> {
  const row = await prisma.variantInventory.findUnique({
    where: { userId_cardId: { userId, cardId } },
    select: { count: true },
  });
  return row?.count ?? 0;
}

export async function isVariantOwned(userId: string, cardId: string): Promise<boolean> {
  const count = await getVariantCount(userId, cardId);
  return count > 0;
}

export async function incrementVariant(userId: string, cardId: string, delta = 1): Promise<number> {
  const row = await prisma.variantInventory.upsert({
    where: { userId_cardId: { userId, cardId } },
    create: { userId, cardId, count: delta },
    update: { count: { increment: delta } },
    select: { count: true },
  });
  return row.count;
}

export async function decrementVariant(userId: string, cardId: string, delta = 1): Promise<boolean> {
  const result = await prisma.variantInventory.updateMany({
    where: { userId, cardId, count: { gte: delta } },
    data: { count: { decrement: delta } },
  });
  return result.count > 0;
}

export async function getOwnedVariantIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.variantInventory.findMany({
    where: { userId, count: { gt: 0 } },
    select: { cardId: true },
  });
  return new Set(rows.map((r) => r.cardId));
}
