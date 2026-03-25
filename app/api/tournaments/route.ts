import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { generateJoinCode } from '@/lib/tournament/tournamentEngine';
import { validateLeagueKeys } from '@/lib/tournament/leagueUtils';

const ADMIN_EMAILS = ['matteo.biyikli3224@gmail.com'];
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

function isAdmin(session: { user?: { email?: string | null; name?: string | null } } | null): boolean {
  if (!session?.user) return false;
  if (session.user.email && ADMIN_EMAILS.includes(session.user.email)) return true;
  if (session.user.name && ADMIN_USERNAMES.includes(session.user.name)) return true;
  return false;
}

// GET - list tournaments with optional filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (status) where.status = status;

    const tournaments = await prisma.tournament.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        participants: { select: { id: true, userId: true, username: true, deckId: true, deckValid: true } },
        _count: { select: { participants: true, matches: true } },
      },
    });

    return NextResponse.json({ tournaments });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - create a tournament
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      name, gameMode, maxPlayers, isPublic,
      useBanList, sealedBoosterCount,
      bannedCardIds, allowedLeagues, scheduledStartAt,
      // Restricted mode fields
      allowedGroups, bannedGroups, allowedKeywords, bannedKeywords,
      allowedRarities, bannedRarities, maxPerRarity,
      maxCopiesPerCard, minDeckSize, maxDeckSize, maxChakraCost,
      restrictionNote,
    } = body;
    const type = 'simulator'; // Only simulator tournaments

    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Only admins can create tournaments' }, { status: 403 });
    }

    const validSizes = [4, 8, 16, 32];
    if (!validSizes.includes(maxPlayers)) {
      return NextResponse.json({ error: 'Max players must be 4, 8, 16, or 32' }, { status: 400 });
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Validate allowedLeagues (simulator only)
    const leagueRestrictions: string[] = [];
    if (type === 'simulator' && Array.isArray(allowedLeagues) && allowedLeagues.length > 0) {
      if (!validateLeagueKeys(allowedLeagues)) {
        return NextResponse.json({ error: 'Invalid league tier keys' }, { status: 400 });
      }
      leagueRestrictions.push(...allowedLeagues);
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { username: true },
    });

    const tournament = await prisma.tournament.create({
      data: {
        name: name.trim(),
        type,
        status: 'registration',
        gameMode: gameMode || 'classic',
        maxPlayers,
        isPublic: isPublic !== false,
        joinCode: generateJoinCode(),
        creatorId: session.user.id,
        creatorUsername: user?.username || 'Unknown',
        requiresDiscord: true,
        useBanList: useBanList !== false,
        sealedBoosterCount: gameMode === 'sealed' ? (sealedBoosterCount || 5) : null,
        bannedCardIds: Array.isArray(bannedCardIds) ? bannedCardIds : [],
        allowedLeagues: leagueRestrictions,
        // Restricted mode constraints
        allowedGroups: Array.isArray(allowedGroups) ? allowedGroups : [],
        bannedGroups: Array.isArray(bannedGroups) ? bannedGroups : [],
        allowedKeywords: Array.isArray(allowedKeywords) ? allowedKeywords : [],
        bannedKeywords: Array.isArray(bannedKeywords) ? bannedKeywords : [],
        allowedRarities: Array.isArray(allowedRarities) ? allowedRarities : [],
        bannedRarities: Array.isArray(bannedRarities) ? bannedRarities : [],
        maxPerRarity: maxPerRarity ?? null,
        maxCopiesPerCard: typeof maxCopiesPerCard === 'number' ? maxCopiesPerCard : null,
        minDeckSize: typeof minDeckSize === 'number' ? minDeckSize : null,
        maxDeckSize: typeof maxDeckSize === 'number' ? maxDeckSize : null,
        maxChakraCost: typeof maxChakraCost === 'number' ? maxChakraCost : null,
        restrictionNote: typeof restrictionNote === 'string' ? restrictionNote.trim() : null,
        scheduledStartAt: scheduledStartAt ? new Date(scheduledStartAt) : null,
      },
    });

    return NextResponse.json({ tournament }, { status: 201 });
  } catch (err) {
    console.error('[API] POST /api/tournaments error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 });
  }
}
