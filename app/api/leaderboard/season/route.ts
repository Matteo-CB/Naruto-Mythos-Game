import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { SAISON_ARCHIVEE } from '@/lib/badges/saisonBadges';
import { COUNTRY_CODES } from '@/lib/data/countries';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonId = (searchParams.get('seasonId') || SAISON_ARCHIVEE).trim().toUpperCase();
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);
    const search = searchParams.get('search')?.trim() || '';
    const countryParam = searchParams.get('country')?.trim() || '';
    const country = countryParam === 'none' || COUNTRY_CODES.has(countryParam) ? countryParam : '';

    const conditions: Record<string, unknown>[] = [{ seasonId }];
    if (search) conditions.push({ username: { contains: search, mode: 'insensitive' as const } });
    if (country === 'none') conditions.push({ countryCode: null });
    else if (country) conditions.push({ countryCode: country });

    const where = conditions.length === 1 ? conditions[0] : { AND: conditions };

    const [rows, total] = await Promise.all([
      prisma.seasonRanking.findMany({
        where,
        orderBy: { rank: 'asc' },
        take: limit,
        skip: offset,
        select: {
          userId: true,
          username: true,
          rank: true,
          elo: true,
          wins: true,
          losses: true,
          draws: true,
          games: true,
          countryCode: true,
          badge: true,
          league: true,
        },
      }),
      prisma.seasonRanking.count({ where }),
    ]);

    const porteurs = await prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.userId) } },
      select: { id: true, selectedSeasonBadge: true },
    });
    const badgeParJoueur = new Map(porteurs.map((u) => [u.id, u.selectedSeasonBadge]));
    const lignes = rows.map((r) => ({ ...r, selectedSeasonBadge: badgeParJoueur.get(r.userId) ?? null }));

    const distinctCountries = await prisma.seasonRanking.findMany({
      where: { seasonId, countryCode: { not: null } },
      distinct: ['countryCode'],
      select: { countryCode: true },
    });
    const countries = distinctCountries
      .map((r) => r.countryCode)
      .filter((c): c is string => typeof c === 'string' && c.length > 0)
      .sort();

    const response = NextResponse.json({ seasonId, rows: lignes, total, limit, offset, countries });
    response.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
    return response;
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
