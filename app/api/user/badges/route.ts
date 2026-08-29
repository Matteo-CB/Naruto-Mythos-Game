import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { isAdmin } from '@/lib/auth/admins';
import { badgesDeSaisonPourAdmin, badgesDeRecompensePourAdmin, fusionneLesBadges } from '@/lib/badges/badgesAdmin';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const compte = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, email: true },
  });
  if (!compte) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const [gagnes, recompenses] = await Promise.all([
    prisma.seasonRanking.findMany({
      where: { userId, badge: { not: null } },
      orderBy: { rank: 'asc' },
      select: { seasonId: true, badge: true, rank: true },
    }),
    prisma.playerBadge.findMany({
      where: { userId },
      orderBy: { awardedAt: 'asc' },
      distinct: ['badge'],
      select: { badge: true },
    }),
  ]);

  const administrateur = isAdmin({ username: compte.username, email: compte.email ?? '' });

  const seasonBadges = administrateur
    ? fusionneLesBadges(
        gagnes.map((g) => ({ seasonId: g.seasonId, badge: g.badge, rank: g.rank })),
        badgesDeSaisonPourAdmin().map((b) => ({ seasonId: b.seasonId, badge: b.badge, rank: b.rank })),
      )
    : gagnes;

  const awardBadges = administrateur
    ? fusionneLesBadges(recompenses, badgesDeRecompensePourAdmin())
    : recompenses;

  return NextResponse.json({ seasonBadges, awardBadges, admin: administrateur });
}
