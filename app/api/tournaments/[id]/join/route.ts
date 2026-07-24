import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { getPlayerLeague } from '@/lib/tournament/leagueUtils';
import { getSocketIO } from '@/lib/socket/server';
import { generateSealedPool, type SealedSetChoice } from '@/lib/sealed/boosterGenerator';
import { isSuspended } from '@/lib/moderation/sanctions';
import { NWL_PARTNER_KEY, checkNwlMembership, NWL_INVITE_URL } from '@/lib/tournament/nwlPartner';


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized', errorKey: 'tournament.error.unauthorized' }, { status: 401 });
    }

    if (await isSuspended(session.user.id)) {
      return NextResponse.json({ error: 'Account suspended', errorKey: 'game.error.suspended' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: { _count: { select: { participants: true } } },
    });

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found', errorKey: 'tournament.error.notFound' }, { status: 404 });
    }
    if (tournament.status !== 'registration') {
      return NextResponse.json({ error: 'Registration is closed', errorKey: 'tournament.error.registrationClosed' }, { status: 400 });
    }
    if (tournament._count.participants >= tournament.maxPlayers) {
      return NextResponse.json({ error: 'Tournament is full', errorKey: 'tournament.error.tournamentFull' }, { status: 400 });
    }

    
    if (!tournament.isPublic) {
      if (!body.joinCode || body.joinCode !== tournament.joinCode) {
        return NextResponse.json({ error: 'Invalid join code', errorKey: 'tournament.error.invalidJoinCode' }, { status: 403 });
      }
    }


    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { username: true, discordId: true, elo: true, gameBanned: true, gameBanUntil: true },
    });

    if (user?.gameBanned) {
      const now = new Date();
      if (!user.gameBanUntil || user.gameBanUntil > now) {
        return NextResponse.json({ error: 'You are banned from playing online', errorKey: 'tournament.error.bannedFromGame' }, { status: 403 });
      }
      await prisma.user.update({
        where: { id: session.user.id },
        data: { gameBanned: false, gameBanUntil: null },
      });
    }

    

    
    if (
      tournament.type === 'simulator' &&
      Array.isArray(tournament.allowedLeagues) &&
      tournament.allowedLeagues.length > 0
    ) {
      const playerLeague = getPlayerLeague(user?.elo ?? 0);
      if (!tournament.allowedLeagues.includes(playerLeague)) {
        return NextResponse.json({ error: 'Your current rank does not meet the requirements for this tournament', errorKey: 'tournament.error.rankNotAllowed' }, { status: 403 });
      }
    }

    if (tournament.requiresDiscord && !user?.discordId) {
      return NextResponse.json({ error: 'Link your Discord account first', errorKey: 'tournament.error.linkDiscord' }, { status: 403 });
    }

    if (tournament.partner === NWL_PARTNER_KEY) {
      if (!user?.discordId) {
        return NextResponse.json({ error: 'Link your Discord account first', errorKey: 'tournament.error.linkDiscord' }, { status: 403 });
      }
      const membership = await checkNwlMembership(user.discordId);
      if (membership === 'not_member') {
        return NextResponse.json({ error: 'Join the New World Loot Discord server first', errorKey: 'tournament.error.nwlNotMember', inviteUrl: NWL_INVITE_URL }, { status: 403 });
      }
      if (membership === 'unavailable') {
        return NextResponse.json({ error: 'Membership check temporarily unavailable, please try again in a moment', errorKey: 'tournament.error.nwlCheckUnavailable' }, { status: 503 });
      }
    }


    const activeBan = await prisma.userBan.findFirst({
      where: {
        userId: session.user.id,
        type: 'tournament',
        OR: [
          { permanent: true },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });
    if (activeBan) {
      return NextResponse.json({ error: 'You are banned from tournaments', errorKey: 'tournament.error.bannedFromTournaments' }, { status: 403 });
    }

    
    const existing = await prisma.tournamentParticipant.findUnique({
      where: { tournamentId_userId: { tournamentId: id, userId: session.user.id } },
    });
    if (existing) {
      return NextResponse.json({ error: 'Already joined', errorKey: 'tournament.error.alreadyJoined' }, { status: 400 });
    }

    try {
      let sealedPoolData: { boosters: unknown; allCards: unknown } | null = null;
      if (tournament.gameMode === 'sealed') {
        try {
          const count = (tournament.sealedBoosterCount ?? 5) as 4 | 5 | 6;
          const choice: SealedSetChoice = (tournament.sealedSetChoice ?? 'random') as SealedSetChoice;
          sealedPoolData = generateSealedPool(count, choice);
        } catch (poolErr) {
          console.error('[API] Sealed pool generation failed on join:', poolErr);
          return NextResponse.json({ error: 'Failed to generate sealed pool', errorKey: 'tournament.error.serverError' }, { status: 500 });
        }
      }

      const participant = await prisma.tournamentParticipant.create({
        data: {
          tournamentId: id,
          userId: session.user.id,
          username: user?.username || 'Unknown',
          ...(sealedPoolData ? { sealedPool: sealedPoolData as never } : {}),
        },
      });
      const fresh = await prisma.tournament.findUnique({
        where: { id },
        select: { status: true },
      });
      if (fresh?.status !== 'registration') {
        await prisma.tournamentParticipant.delete({ where: { id: participant.id } }).catch(() => {});
        return NextResponse.json({ error: 'Registration closed', errorKey: 'tournament.error.registrationClosed' }, { status: 400 });
      }
      const newCount = await prisma.tournamentParticipant.count({
        where: { tournamentId: id },
      });
      if (newCount > tournament.maxPlayers) {
        await prisma.tournamentParticipant.delete({ where: { id: participant.id } }).catch(() => {});
        return NextResponse.json({ error: 'Tournament is full', errorKey: 'tournament.error.tournamentFull' }, { status: 400 });
      }
      const io = getSocketIO();
      if (io) io.to(`tournament:${id}`).emit('tournament:refresh');
      return NextResponse.json({ participant }, { status: 201 });
    } catch (createErr) {
      const msg = createErr instanceof Error ? createErr.message : '';
      if (msg.includes('Unique constraint') || msg.includes('duplicate key')) {
        return NextResponse.json({ error: 'Already joined', errorKey: 'tournament.error.alreadyJoined' }, { status: 409 });
      }
      throw createErr;
    }
  } catch (err) {
    console.error('[API] POST /api/tournaments/join error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error', errorKey: 'tournament.error.serverError' }, { status: 500 });
  }
}
