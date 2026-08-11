import { prisma } from '@/lib/db/prisma';
import { ADMIN_USERNAMES, ADMIN_EMAILS, TOURNAMENT_OWNER_USERNAME } from '@/lib/auth/admins';

export interface TournamentOwner {
  id: string;
  username: string;
}

export async function findTournamentOwner(): Promise<TournamentOwner | null> {
  const prefere = await prisma.user.findFirst({
    where: { username: { equals: TOURNAMENT_OWNER_USERNAME, mode: 'insensitive' } },
    select: { id: true, username: true },
  });
  if (prefere) return prefere;

  return prisma.user.findFirst({
    where: {
      OR: [
        { username: { in: [...ADMIN_USERNAMES] } },
        { email: { in: [...ADMIN_EMAILS] } },
      ],
    },
    select: { id: true, username: true },
  });
}
