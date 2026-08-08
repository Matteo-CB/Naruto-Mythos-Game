import { prisma } from '@/lib/db/prisma';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(email: string) {
  const typed = email.trim();
  if (!typed) return null;

  const exact = await prisma.user.findUnique({ where: { email: typed } });
  if (exact) return exact;

  return prisma.user.findFirst({
    where: { email: { equals: typed, mode: 'insensitive' } },
  });
}

export async function emailAlreadyTaken(email: string): Promise<boolean> {
  return (await findUserByEmail(email)) !== null;
}
