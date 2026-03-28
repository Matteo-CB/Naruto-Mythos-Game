import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/authOptions';
import { prisma } from '@/lib/db/prisma';
import { generateBracket } from '@/lib/tournament/tournamentEngine';
import { computeSwissRoundCount, generateSwissRound1 } from '@/lib/tournament/swissEngine';
import type { SwissPlayer } from '@/lib/tournament/swissEngine';

const ADMIN_EMAILS = ['matteo.biyikli3224@gmail.com'];
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

function isAdmin(session: { user?: { email?: string | null; name?: string | null } } | null): boolean {
  if (!session?.user) return false;
  if (session.user.email && ADMIN_EMAILS.includes(session.user.email)) return true;
  if (session.user.name && ADMIN_USERNAMES.includes(session.user.name)) return true;
  return false;
}

// POST - start the tournament (generate bracket)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: { participants: true },
    });

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
    }

    const isCreator = tournament.creatorId === session.user.id;
    if (!isCreator && !isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (tournament.status !== 'registration') {
      return NextResponse.json({ error: 'Tournament already started or completed' }, { status: 400 });
    }

    // Disqualify players without valid decks (non-sealed tournaments)
    if (tournament.gameMode !== 'sealed') {
      const invalidPlayers = tournament.participants.filter(p => !p.deckValid || !p.deckId);
      for (const p of invalidPlayers) {
        await prisma.tournamentParticipant.update({
          where: { id: p.id },
          data: { eliminated: true, eliminatedRound: 0 },
        });
      }
      // Re-fetch participants after disqualification
      const validParticipants = tournament.participants.filter(p => p.deckValid && p.deckId);
      tournament.participants = validParticipants;
    }

    if (tournament.participants.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 players with valid decks' }, { status: 400 });
    }

    // Check if manual seeds were assigned (via the pairings API)
    const hasManualSeeds = tournament.participants.some(p => p.seed !== null && p.seed !== undefined);

    let orderedParticipants;
    if (hasManualSeeds) {
      // Respect manual pairings - sort by seed (unset seeds go last, randomized)
      const seeded = tournament.participants.filter(p => p.seed !== null && p.seed !== undefined);
      const unseeded = [...tournament.participants.filter(p => p.seed === null || p.seed === undefined)]
        .sort(() => Math.random() - 0.5);
      seeded.sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
      orderedParticipants = [...seeded, ...unseeded];
      // Assign seeds to any unseeded participants
      for (let i = 0; i < orderedParticipants.length; i++) {
        if (orderedParticipants[i].seed === null || orderedParticipants[i].seed === undefined) {
          await prisma.tournamentParticipant.update({
            where: { id: orderedParticipants[i].id },
            data: { seed: i + 1 },
          });
        }
      }
    } else {
      // No manual seeds - shuffle randomly
      orderedParticipants = [...tournament.participants].sort(() => Math.random() - 0.5);
      for (let i = 0; i < orderedParticipants.length; i++) {
        await prisma.tournamentParticipant.update({
          where: { id: orderedParticipants[i].id },
          data: { seed: i + 1 },
        });
      }
    }

    const isSwiss = tournament.format === 'swiss';

    if (isSwiss) {
      // --- Swiss format: generate round 1 only ---
      const swissPlayers: SwissPlayer[] = orderedParticipants.map((p, i) => ({
        userId: p.userId,
        username: p.username,
        seed: p.seed ?? (i + 1),
      }));
      const totalRounds = computeSwissRoundCount(swissPlayers.length);
      const round1 = generateSwissRound1(swissPlayers);

      for (const pairing of round1) {
        const isBye = pairing.player2 === null;
        const matchData = {
          tournamentId: id,
          round: pairing.round,
          matchIndex: pairing.matchIndex,
          player1Id: pairing.player1.userId,
          player1Username: pairing.player1.username,
          player2Id: pairing.player2?.userId ?? null,
          player2Username: pairing.player2?.username ?? null,
          winnerId: isBye ? pairing.player1.userId : null,
          winnerUsername: isBye ? pairing.player1.username : null,
          isBye,
          status: isBye ? 'completed' : 'ready',
        };
        await prisma.tournamentMatch.create({ data: matchData });

        if (isBye) {
          await prisma.tournamentParticipant.updateMany({
            where: { tournamentId: id, userId: pairing.player1.userId },
            data: { hasBye: true },
          });
        }
      }

      await prisma.tournament.update({
        where: { id },
        data: {
          status: 'in_progress',
          currentRound: 1,
          totalRounds,
          startedAt: new Date(),
        },
      });
    } else {
      // --- Elimination format: generate full bracket ---
      const participants = orderedParticipants.map(p => ({
        userId: p.userId,
        username: p.username,
      }));
      const { matches, totalRounds } = generateBracket(participants);

      for (const m of matches) {
        const matchData = {
          tournamentId: id,
          round: m.round,
          matchIndex: m.matchIndex,
          player1Id: m.player1.participantId,
          player1Username: m.player1.username,
          player2Id: m.player2.participantId,
          player2Username: m.player2.username,
          winnerId: m.winnerId,
          winnerUsername: m.winnerUsername,
          isBye: m.isBye,
          status: m.status === 'ready' ? 'ready' : m.status === 'completed' ? 'completed' : 'pending',
        };
        await prisma.tournamentMatch.create({ data: matchData });

        if (m.isBye && m.winnerId) {
          await prisma.tournamentParticipant.updateMany({
            where: { tournamentId: id, userId: m.winnerId },
            data: { hasBye: true },
          });
        }
      }

      await prisma.tournament.update({
        where: { id },
        data: {
          status: 'in_progress',
          currentRound: 1,
          totalRounds,
          startedAt: new Date(),
        },
      });
    }

    // Return full tournament
    const updated = await prisma.tournament.findUnique({
      where: { id },
      include: {
        participants: { orderBy: { seed: 'asc' } },
        matches: { orderBy: [{ round: 'asc' }, { matchIndex: 'asc' }] },
      },
    });

    return NextResponse.json({ tournament: updated });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
