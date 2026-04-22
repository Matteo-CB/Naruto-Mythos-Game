/**
 * Suspicious-activity heuristics for the admin panel.
 *
 * Limitations to be aware of:
 *  - Completed ranked games are deleted from the DB after GAME_TTL_MS
 *    (see lib/db/gameCleanup.ts + finalizeGameEnd in lib/socket/server.ts).
 *    Game-based heuristics therefore only cover that window.
 *  - We don't log IP addresses anywhere, so cross-account matching relies on
 *    shared emails, shared Discord IDs, and clustered createdAt timestamps.
 *
 * Each heuristic returns a list of Findings. A Finding is a compact record
 * the UI can render directly: severity, short description, the users/games
 * involved, and (optionally) a game id the admin can revert ELO on.
 */

import { prisma } from '@/lib/db/prisma';
import { GAME_TTL_MS } from '@/lib/db/gameCleanup';

const GAME_WINDOW_HOURS = Math.round(GAME_TTL_MS / (60 * 60 * 1000));

export type Severity = 'low' | 'medium' | 'high';

export interface FindingUser {
  id: string;
  username: string;
  email: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  discordId: string | null;
  createdAt: string;
}

export interface FindingGame {
  id: string;
  player1Id: string | null;
  player2Id: string | null;
  player1Name: string | null;
  player2Name: string | null;
  winnerId: string | null;
  player1Score: number;
  player2Score: number;
  eloChange: number | null;
  durationSec: number | null;
  completedAt: string | null;
  createdAt: string;
}

export interface Finding {
  id: string;                    // stable hash-like id for UI keys & dismissal
  type:
    | 'same_email_base'
    | 'same_discord_id'
    | 'created_together'
    | 'repeat_opponents'
    | 'short_forfeit'
    | 'rapid_wins_new_account';
  severity: Severity;
  title: string;
  description: string;
  users: FindingUser[];
  game: FindingGame | null;
  metrics: Record<string, string | number>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function emailBase(email: string): string {
  const at = email.indexOf('@');
  if (at < 0) return email.toLowerCase();
  // Strip +suffix aliases and non-alphanum noise so "a.b+1@gmail" ≡ "ab@gmail"
  return email
    .slice(0, at)
    .toLowerCase()
    .replace(/\+.*$/, '')
    .replace(/[^a-z0-9]/g, '');
}

function shortFinding(type: Finding['type'], parts: (string | null | undefined)[]): string {
  return `${type}:${parts.filter(Boolean).join('|')}`;
}

async function hydrateUsers(ids: string[]): Promise<FindingUser[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, username: true, email: true, elo: true,
      wins: true, losses: true, draws: true,
      discordId: true, createdAt: true,
    },
  });
  return rows.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  }));
}

async function hydrateGames(ids: string[]): Promise<Map<string, FindingGame>> {
  const out = new Map<string, FindingGame>();
  if (ids.length === 0) return out;
  const rows = await prisma.game.findMany({
    where: { id: { in: ids } },
    include: {
      player1: { select: { id: true, username: true } },
      player2: { select: { id: true, username: true } },
    },
  });
  for (const g of rows) {
    const durationSec =
      g.completedAt && g.createdAt
        ? Math.round((g.completedAt.getTime() - g.createdAt.getTime()) / 1000)
        : null;
    out.set(g.id, {
      id: g.id,
      player1Id: g.player1Id,
      player2Id: g.player2Id,
      player1Name: g.player1?.username ?? null,
      player2Name: g.player2?.username ?? null,
      winnerId: g.winnerId,
      player1Score: g.player1Score,
      player2Score: g.player2Score,
      eloChange: g.eloChange,
      durationSec,
      completedAt: g.completedAt?.toISOString() ?? null,
      createdAt: g.createdAt.toISOString(),
    });
  }
  return out;
}

// ── Heuristics ──────────────────────────────────────────────────────────────

/**
 * H1. Two or more users share the same normalized email base
 * (everything before @, aliases stripped). Strong signal for multi-accounting.
 */
async function findSameEmailBase(): Promise<Finding[]> {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, email: true, elo: true,
              wins: true, losses: true, draws: true, discordId: true, createdAt: true },
  });
  const byBase = new Map<string, typeof users>();
  for (const u of users) {
    const b = emailBase(u.email);
    if (!b) continue;
    const list = byBase.get(b) ?? [];
    list.push(u);
    byBase.set(b, list);
  }
  const findings: Finding[] = [];
  for (const [base, group] of byBase) {
    if (group.length < 2) continue;
    const findingUsers = group.map((u) => ({
      ...u, createdAt: u.createdAt.toISOString(),
    }));
    findings.push({
      id: shortFinding('same_email_base', [base]),
      type: 'same_email_base',
      severity: 'high',
      title: `${group.length} accounts share the same email base "${base}"`,
      description:
        `Accounts ${group.map((u) => `"${u.username}"`).join(', ')} all use the ` +
        `same email prefix "${base}". This is a strong signal of multi-accounting.`,
      users: findingUsers,
      game: null,
      metrics: { accounts: group.length, emailBase: base },
    });
  }
  return findings;
}

/**
 * H2. Two or more users link the same Discord ID. Same person.
 */
async function findSameDiscordId(): Promise<Finding[]> {
  const rows = await prisma.user.findMany({
    where: { discordId: { not: null } },
    select: { id: true, username: true, email: true, elo: true,
              wins: true, losses: true, draws: true, discordId: true, createdAt: true },
  });
  const byDiscord = new Map<string, typeof rows>();
  for (const u of rows) {
    if (!u.discordId) continue;
    const list = byDiscord.get(u.discordId) ?? [];
    list.push(u);
    byDiscord.set(u.discordId, list);
  }
  const findings: Finding[] = [];
  for (const [did, group] of byDiscord) {
    if (group.length < 2) continue;
    findings.push({
      id: shortFinding('same_discord_id', [did]),
      type: 'same_discord_id',
      severity: 'high',
      title: `${group.length} accounts linked to Discord ID ${did}`,
      description:
        `Accounts ${group.map((u) => `"${u.username}"`).join(', ')} all link to ` +
        `the same Discord user. Almost certainly the same person.`,
      users: group.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
      game: null,
      metrics: { accounts: group.length, discordId: did },
    });
  }
  return findings;
}

/**
 * H3. Two accounts created within 10 minutes of each other, then played against
 * each other. Classic smurf pattern to feed ELO to one side.
 */
async function findCreatedTogetherPlayedTogether(): Promise<Finding[]> {
  const now = Date.now();
  const TWENTYFOUR_H = 24 * 60 * 60 * 1000;
  const recentUsers = await prisma.user.findMany({
    where: { createdAt: { gt: new Date(now - TWENTYFOUR_H * 14) } }, // last 14 days
    select: { id: true, username: true, email: true, elo: true,
              wins: true, losses: true, draws: true, discordId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const findings: Finding[] = [];
  const WINDOW_MS = 10 * 60 * 1000; // 10 min
  for (let i = 0; i < recentUsers.length; i++) {
    for (let j = i + 1; j < recentUsers.length; j++) {
      const a = recentUsers[i];
      const b = recentUsers[j];
      const gap = Math.abs(a.createdAt.getTime() - b.createdAt.getTime());
      if (gap > WINDOW_MS) continue;
      // Only flag if they've actually played each other (ranked or not).
      const headToHead = await prisma.game.count({
        where: {
          OR: [
            { player1Id: a.id, player2Id: b.id },
            { player1Id: b.id, player2Id: a.id },
          ],
        },
      });
      if (headToHead === 0) continue;
      findings.push({
        id: shortFinding('created_together', [a.id, b.id]),
        type: 'created_together',
        severity: 'medium',
        title: `"${a.username}" and "${b.username}" created ${Math.round(gap / 1000)}s apart, played each other`,
        description:
          `Both accounts were created within 10 minutes of each other and have ` +
          `at least ${headToHead} head-to-head game(s). Possible smurf setup.`,
        users: [a, b].map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
        game: null,
        metrics: { gapSeconds: Math.round(gap / 1000), headToHeadGames: headToHead },
      });
    }
  }
  return findings;
}

/**
 * H4. Any pair of users who played each other >= 3 times inside the game
 * retention window where the same side won every game (ELO farming).
 */
async function findRepeatOpponents(): Promise<Finding[]> {
  const cutoff = new Date(Date.now() - GAME_TTL_MS);
  const games = await prisma.game.findMany({
    where: {
      completedAt: { gte: cutoff },
      isAiGame: false,
      winnerId: { not: null },
      eloChange: { not: null },
    },
    select: { id: true, player1Id: true, player2Id: true, winnerId: true,
              eloChange: true, completedAt: true, createdAt: true },
  });
  const pairs = new Map<string, { gameIds: string[]; winners: Set<string>; totalElo: number }>();
  for (const g of games) {
    if (!g.player1Id || !g.player2Id) continue;
    const [lo, hi] = g.player1Id < g.player2Id ? [g.player1Id, g.player2Id] : [g.player2Id, g.player1Id];
    const key = `${lo}|${hi}`;
    const cur = pairs.get(key) ?? { gameIds: [], winners: new Set(), totalElo: 0 };
    cur.gameIds.push(g.id);
    if (g.winnerId) cur.winners.add(g.winnerId);
    cur.totalElo += Math.abs(g.eloChange ?? 0);
    pairs.set(key, cur);
  }

  const findings: Finding[] = [];
  for (const [key, v] of pairs) {
    if (v.gameIds.length < 3) continue;
    // One-sided series: one player won every game
    const oneSided = v.winners.size === 1;
    const [idA, idB] = key.split('|');
    const users = await hydrateUsers([idA, idB]);
    findings.push({
      id: shortFinding('repeat_opponents', [idA, idB]),
      type: 'repeat_opponents',
      severity: oneSided ? 'high' : 'medium',
      title: `${users[0]?.username ?? idA} vs ${users[1]?.username ?? idB}: ${v.gameIds.length} games in ${GAME_WINDOW_HOURS}h${oneSided ? ' (one-sided)' : ''}`,
      description:
        `These two players faced each other ${v.gameIds.length} time(s) in the last ${GAME_WINDOW_HOURS}h, ` +
        `for a cumulative ±${v.totalElo} ELO transfer. ${oneSided ? 'The same side won every single game — strong farming signal.' : 'Mixed outcomes, still worth reviewing.'}`,
      users,
      game: null,
      metrics: {
        headToHeadGames: v.gameIds.length,
        eloTransferred: v.totalElo,
        oneSided: oneSided ? 'yes' : 'no',
      },
    });
  }
  return findings;
}

/**
 * H5. Ranked games that ended by forfeit within 60s of creation.
 * Sub-60s ranked games are almost always self-forfeits to feed ELO.
 */
async function findShortForfeits(): Promise<Finding[]> {
  const cutoff = new Date(Date.now() - GAME_TTL_MS);
  const games = await prisma.game.findMany({
    where: {
      completedAt: { gte: cutoff },
      isAiGame: false,
      eloChange: { not: null },
    },
    select: { id: true, player1Id: true, player2Id: true, winnerId: true,
              eloChange: true, createdAt: true, completedAt: true,
              player1Score: true, player2Score: true },
  });
  const findings: Finding[] = [];
  for (const g of games) {
    if (!g.completedAt || !g.createdAt) continue;
    const durationSec = (g.completedAt.getTime() - g.createdAt.getTime()) / 1000;
    if (durationSec > 60) continue;
    // A sub-60s ranked game is abnormal regardless of the reason.
    const gameMap = await hydrateGames([g.id]);
    const game = gameMap.get(g.id) ?? null;
    const users = await hydrateUsers([g.player1Id, g.player2Id].filter(Boolean) as string[]);
    findings.push({
      id: shortFinding('short_forfeit', [g.id]),
      type: 'short_forfeit',
      severity: 'medium',
      title: `Ranked game ${g.id} ended in ${Math.round(durationSec)}s`,
      description:
        `Ranked game completed in less than 60 seconds — very likely a self-forfeit ` +
        `to transfer ELO. ELO moved: ${Math.abs(g.eloChange ?? 0)}.`,
      users,
      game,
      metrics: {
        durationSec: Math.round(durationSec),
        eloMoved: Math.abs(g.eloChange ?? 0),
      },
    });
  }
  return findings;
}

/**
 * H6. An account less than 48h old with 5+ ranked wins, all against
 * opponents that also have very few games. New smurf alt.
 */
async function findRapidWinsNewAccount(): Promise<Finding[]> {
  const now = Date.now();
  const TWO_DAYS = 48 * 60 * 60 * 1000;
  const newUsers = await prisma.user.findMany({
    where: {
      createdAt: { gt: new Date(now - TWO_DAYS) },
      wins: { gte: 5 },
    },
    select: { id: true, username: true, email: true, elo: true,
              wins: true, losses: true, draws: true, discordId: true, createdAt: true },
  });
  const findings: Finding[] = [];
  for (const u of newUsers) {
    const total = u.wins + u.losses + u.draws;
    const winRate = total > 0 ? u.wins / total : 0;
    if (winRate < 0.8) continue; // only flag very high win rate
    findings.push({
      id: shortFinding('rapid_wins_new_account', [u.id]),
      type: 'rapid_wins_new_account',
      severity: 'medium',
      title: `New account "${u.username}" — ${u.wins}/${total} wins (${Math.round(winRate * 100)}%)`,
      description:
        `Account created ${Math.round((now - u.createdAt.getTime()) / 3600000)}h ago ` +
        `has already played ${total} ranked games with ${u.wins} wins. ` +
        `Win rate ${Math.round(winRate * 100)}% on a brand-new account is unusual.`,
      users: [{ ...u, createdAt: u.createdAt.toISOString() }],
      game: null,
      metrics: {
        ageHours: Math.round((now - u.createdAt.getTime()) / 3600000),
        wins: u.wins,
        totalRankedGames: total,
        winRatePct: Math.round(winRate * 100),
      },
    });
  }
  return findings;
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Run every heuristic and return a single deduplicated, severity-sorted list. */
export async function runAllHeuristics(): Promise<Finding[]> {
  const results = await Promise.all([
    findSameEmailBase(),
    findSameDiscordId(),
    findCreatedTogetherPlayedTogether(),
    findRepeatOpponents(),
    findShortForfeits(),
    findRapidWinsNewAccount(),
  ]);
  const all = results.flat();
  const bySeverity = { high: 0, medium: 1, low: 2 };
  all.sort((a, b) => bySeverity[a.severity] - bySeverity[b.severity]);
  // Dedup by id in case two heuristics produced the same finding.
  const seen = new Set<string>();
  return all.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
}

/** Run all heuristics then restrict to findings involving the given user IDs. */
export async function runHeuristicsForUsers(userIds: string[]): Promise<Finding[]> {
  const all = await runAllHeuristics();
  if (userIds.length === 0) return all;
  const idSet = new Set(userIds);
  return all.filter((f) => f.users.some((u) => idSet.has(u.id)));
}

/**
 * Revert the ELO change of a single ranked game:
 *  - Undo the delta on both players' ELO (and reset consecWins/Losses to 0
 *    for both, since we're rewinding their streak past this game).
 *  - Decrement the winner's wins / loser's losses by 1.
 *  - Null out game.eloChange so the same game can't be reverted twice and so
 *    heuristics ignore it going forward.
 *  Returns the summary of what changed.
 */
export async function revertGameElo(gameId: string): Promise<{
  ok: boolean;
  message: string;
  applied?: {
    gameId: string;
    player1Id: string | null;
    player2Id: string | null;
    player1NewElo: number | null;
    player2NewElo: number | null;
    eloDeltaReverted: number;
  };
}> {
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  if (!game) return { ok: false, message: 'Game not found.' };
  if (game.eloChange === null) return { ok: false, message: 'Game has no ELO change to revert (AI game, unranked, or already reverted).' };
  if (!game.player1Id || !game.player2Id) return { ok: false, message: 'Game is missing player references, cannot revert cleanly.' };

  const delta = game.eloChange; // player1Delta as stored by the socket server
  const [p1, p2] = await Promise.all([
    prisma.user.findUnique({ where: { id: game.player1Id } }),
    prisma.user.findUnique({ where: { id: game.player2Id } }),
  ]);
  if (!p1 || !p2) return { ok: false, message: 'One or both players no longer exist.' };

  const p1New = p1.elo - delta;
  const p2New = p2.elo + delta;

  const p1WonThisGame = game.winnerId === p1.id;
  const p2WonThisGame = game.winnerId === p2.id;
  const wasDraw = !p1WonThisGame && !p2WonThisGame;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: p1.id },
      data: {
        elo: p1New,
        wins: p1WonThisGame ? Math.max(0, p1.wins - 1) : p1.wins,
        losses: p2WonThisGame ? Math.max(0, p1.losses - 1) : p1.losses,
        draws: wasDraw ? Math.max(0, p1.draws - 1) : p1.draws,
        consecutiveWins: 0,
        consecutiveLosses: 0,
      },
    }),
    prisma.user.update({
      where: { id: p2.id },
      data: {
        elo: p2New,
        wins: p2WonThisGame ? Math.max(0, p2.wins - 1) : p2.wins,
        losses: p1WonThisGame ? Math.max(0, p2.losses - 1) : p2.losses,
        draws: wasDraw ? Math.max(0, p2.draws - 1) : p2.draws,
        consecutiveWins: 0,
        consecutiveLosses: 0,
      },
    }),
    prisma.game.update({
      where: { id: gameId },
      data: { eloChange: null },
    }),
  ]);

  return {
    ok: true,
    message: `Reverted game ${gameId}: ${p1.username} ${p1.elo} → ${p1New}, ${p2.username} ${p2.elo} → ${p2New}.`,
    applied: {
      gameId,
      player1Id: p1.id,
      player2Id: p2.id,
      player1NewElo: p1New,
      player2NewElo: p2New,
      eloDeltaReverted: delta,
    },
  };
}
