import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { doitVoirLintro, SAISON_DE_LINTRO, type DonneesDeLintro } from '@/lib/season/intro';
import { rangDeLigue } from '@/lib/leagues/paliers';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ show: false }, { status: 200 });
  }

  const userId = session.user.id;
  const compte = await prisma.user.findUnique({
    where: { id: userId },
    select: { elo: true, createdAt: true, seasonIntroSeenAt: true },
  });
  if (!compte || !doitVoirLintro(compte.createdAt, compte.seasonIntroSeenAt)) {
    return NextResponse.json({ show: false });
  }

  const archive = await prisma.seasonRanking.findMany({
    where: { userId, seasonId: SAISON_DE_LINTRO },
    orderBy: { rank: 'asc' },
    select: { seasonId: true, badge: true, rank: true, elo: true },
  }).catch(() => [] as Array<{ seasonId: string; badge: string | null; rank: number; elo: number }>);

  const rang = rangDeLigue(compte.elo);
  const donnees: DonneesDeLintro = {
    seasonId: SAISON_DE_LINTRO,
    badges: archive
      .filter((a): a is { seasonId: string; badge: string; rank: number; elo: number } => !!a.badge)
      .map((a) => ({ seasonId: a.seasonId, badge: a.badge, rank: a.rank })),
    ancienElo: archive[0]?.elo ?? null,
    nouvelElo: compte.elo,
    ligue: rang.key,
    niveau: rang.niveau,
  };

  return NextResponse.json({ show: true, donnees });
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { seasonIntroSeenAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
