import { prisma } from '@/lib/db/prisma';
import { generateBracket, MAIN_BRACKET } from '@/lib/tournament/tournamentEngine';
import { computeSwissRoundCount, generateSwissRound1 } from '@/lib/tournament/swissEngine';
import type { SwissPlayer } from '@/lib/tournament/swissEngine';
import { validateDeckForTournament } from '@/lib/tournament/deckValidation';
import { logMatchEvent } from '@/lib/tournament/matchEventLog';
import { NWL_PARTNER_KEY } from '@/lib/tournament/nwlPartner';

export type StartResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function executeTournamentStart(tournamentId: string): Promise<StartResult> {
  const claimed = await prisma.tournament.updateMany({
    where: { id: tournamentId, status: 'registration' },
    data: { status: 'starting' },
  });
  if (claimed.count === 0) {
    const current = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { status: true } });
    if (!current) return { ok: false, status: 404, error: 'Tournament not found' };
    if (current.status !== 'starting') {
      return { ok: false, status: 400, error: 'Tournament already started or completed' };
    }
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { participants: true },
  });

  if (!tournament) {
    return { ok: false, status: 404, error: 'Tournament not found' };
  }

  const partialMatches = await prisma.tournamentMatch.findFirst({
    where: { tournamentId },
    select: { id: true },
  });
  if (partialMatches) {
    await prisma.tournamentMatch.deleteMany({ where: { tournamentId } });
    console.log(`[Tournament] executeTournamentStart: cleaned partial bracket for ${tournamentId} before retry`);
  }

  if (tournament.useBanList) {
    const globalBans = await prisma.bannedCard.findMany({ select: { cardId: true } });
    const merged = new Set<string>([...(tournament.bannedCardIds ?? []), ...globalBans.map(b => b.cardId)]);
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { bannedCardIds: Array.from(merged), useBanList: false },
    });
    tournament.bannedCardIds = Array.from(merged);
    tournament.useBanList = false;
  }

  tournament.participants = tournament.participants.filter(p => !p.eliminated);

  if (tournament.gameMode === 'sealed') {
    const builtIds = new Set<string>();
    for (const p of tournament.participants) {
      const deck = p.sealedDeck as { cardIds?: unknown; missionIds?: unknown } | null;
      const hasDeck = !!deck && Array.isArray(deck.cardIds) && Array.isArray(deck.missionIds)
        && deck.cardIds.length >= 30 && deck.missionIds.length === 3;
      if (hasDeck && p.deckValid) {
        builtIds.add(p.id);
        continue;
      }
      await prisma.tournamentParticipant.update({
        where: { id: p.id },
        data: { eliminated: true, eliminatedRound: 0, deckValid: false },
      });
      console.log(`[startLogic] Sealed tournament ${tournamentId}: ${p.username} never confirmed a sealed deck, removed from the bracket`);
    }
    tournament.participants = tournament.participants.filter((p) => builtIds.has(p.id));
  }

  if (tournament.gameMode !== 'sealed') {
    const stillValidIds = new Set<string>();
    for (const p of tournament.participants) {
      if (!p.deckId) continue;
      const deck = await prisma.deck.findUnique({ where: { id: p.deckId } });
      if (!deck || deck.userId !== p.userId) {
        await prisma.tournamentParticipant.update({
          where: { id: p.id },
          data: { deckValid: false },
        });
        continue;
      }
      const result = validateDeckForTournament(deck, tournament);
      if (result.valid) {
        stillValidIds.add(p.id);
        if (!p.deckValid) {
          await prisma.tournamentParticipant.update({
            where: { id: p.id },
            data: { deckValid: true },
          });
        }
      } else {
        await prisma.tournamentParticipant.update({
          where: { id: p.id },
          data: { deckValid: false },
        });
      }
    }
    const invalidPlayers = tournament.participants.filter(p => !stillValidIds.has(p.id));
    for (const p of invalidPlayers) {
      await prisma.tournamentParticipant.update({
        where: { id: p.id },
        data: { eliminated: true, eliminatedRound: 0 },
      });
      logMatchEvent({ type: 'participant.excluded.invalid-deck', tournamentId, forfeitedPlayerId: p.userId });
      try {
        const { notifyUser } = await import('@/lib/moderation/notify');
        await notifyUser(p.userId, 'tournament_no_deck', { tournamentName: tournament.name });
      } catch (notifyErr) {
        console.error('[startLogic] could not store the no-deck notice:', notifyErr);
      }
      try {
        const { emitToUser } = await import('@/lib/socket/io');
        emitToUser(p.userId, 'tournament:excluded', { tournamentId, reason: 'invalid_deck' });
      } catch { /* socket layer absent in scripts */ }
      console.warn(`[startLogic] ${tournament.name}: ${p.username} excluded at start, no valid deck selected`);
    }
    tournament.participants = tournament.participants.filter(p => stillValidIds.has(p.id));
  }

  if (tournament.participants.length < 2) {
    return { ok: false, status: 400, error: 'Need at least 2 players with valid decks' };
  }

  if (tournament.format === 'double_elimination') {
    const valid = [4, 8, 16, 32];
    if (!valid.includes(tournament.participants.length)) {
      return {
        ok: false,
        status: 400,
        error: `Double elimination requires exactly 4, 8, 16, or 32 valid participants (currently ${tournament.participants.length})`,
      };
    }
  }
  if (tournament.format === 'elimination') {
    const n = tournament.participants.length;
    const minimum = tournament.partner === NWL_PARTNER_KEY ? 4 : 2;
    if (n < minimum) {
      return {
        ok: false,
        status: 400,
        error: `Single elimination requires at least ${minimum} valid participants (currently ${n})`,
      };
    }
  }

  const hasManualSeeds = tournament.participants.some(p => p.seed !== null && p.seed !== undefined);

  let orderedParticipants;
  if (hasManualSeeds) {
    const seeded = tournament.participants.filter(p => p.seed !== null && p.seed !== undefined);
    const unseeded = [...tournament.participants.filter(p => p.seed === null || p.seed === undefined)]
      .sort(() => Math.random() - 0.5);
    seeded.sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0));
    orderedParticipants = [...seeded, ...unseeded];
    for (let i = 0; i < orderedParticipants.length; i++) {
      if (orderedParticipants[i].seed === null || orderedParticipants[i].seed === undefined) {
        await prisma.tournamentParticipant.update({
          where: { id: orderedParticipants[i].id },
          data: { seed: i + 1 },
        });
      }
    }
  } else {
    orderedParticipants = [...tournament.participants].sort(() => Math.random() - 0.5);
    for (let i = 0; i < orderedParticipants.length; i++) {
      await prisma.tournamentParticipant.update({
        where: { id: orderedParticipants[i].id },
        data: { seed: i + 1 },
      });
    }
  }

  const isSwiss = tournament.format === 'swiss';
  const isDoubleElim = tournament.format === 'double_elimination';

  if (isSwiss) {
    const swissPlayers: SwissPlayer[] = orderedParticipants.map((p, i) => ({
      userId: p.userId,
      username: p.username,
      seed: p.seed ?? (i + 1),
    }));
    const totalRounds = computeSwissRoundCount(swissPlayers.length);
    const round1 = generateSwissRound1(swissPlayers);

    for (const pairing of round1) {
      const isBye = pairing.player2 === null;
      await prisma.tournamentMatch.create({
        data: {
          tournamentId,
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
        },
      });

      if (isBye) {
        await prisma.tournamentParticipant.updateMany({
          where: { tournamentId, userId: pairing.player1.userId },
          data: { hasBye: true },
        });
        logMatchEvent({
          type: 'match.advance.bye',
          tournamentId,
          round: pairing.round,
          matchIndex: pairing.matchIndex,
          winnerId: pairing.player1.userId,
        });
      }
    }

    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'in_progress', currentRound: 1, totalRounds, startedAt: new Date() },
    });
  } else if (isDoubleElim) {
    const { generateDoubleElimBracket } = await import('@/lib/tournament/doubleElimEngine');
    const participants = orderedParticipants.map(p => ({ userId: p.userId, username: p.username }));
    const { matches, totalRounds } = generateDoubleElimBracket(participants);

    for (const m of matches) {
      await prisma.tournamentMatch.create({
        data: {
          tournamentId,
          bracket: m.bracket,
          round: m.round,
          matchIndex: m.matchIndex,
          player1Id: m.player1Id,
          player1Username: m.player1Username,
          player2Id: m.player2Id,
          player2Username: m.player2Username,
          winnerId: m.winnerId,
          winnerUsername: m.winnerUsername,
          isBye: m.isBye,
          status: m.status,
        },
      });
      if (m.isBye && m.winnerId) {
        await prisma.tournamentParticipant.updateMany({
          where: { tournamentId, userId: m.winnerId },
          data: { hasBye: true },
        });
      }
    }

    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'in_progress', currentRound: 1, totalRounds, startedAt: new Date() },
    });
  } else {
    const participants = orderedParticipants.map(p => ({ userId: p.userId, username: p.username }));
    const { matches, totalRounds, thirdPlaceMatch } = generateBracket(participants);
    const persistedMatches = thirdPlaceMatch ? [...matches, thirdPlaceMatch] : matches;

    for (const m of persistedMatches) {
      await prisma.tournamentMatch.create({
        data: {
          tournamentId,
          bracket: m.bracket ?? MAIN_BRACKET,
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
        },
      });

      if (m.isBye && m.winnerId) {
        await prisma.tournamentParticipant.updateMany({
          where: { tournamentId, userId: m.winnerId },
          data: { hasBye: true },
        });
      }
    }

    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'in_progress', currentRound: 1, totalRounds, startedAt: new Date() },
    });
  }

  const partenaire = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { partner: true },
  });
  if (partenaire?.partner) {
    const { publierDecksDuTournoi } = await import('@/lib/tournament/nwlTiers');
    await publierDecksDuTournoi(tournamentId).catch(() => false);
  }

  return { ok: true };
}
