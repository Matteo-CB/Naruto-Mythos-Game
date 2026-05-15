// One-off backfill: derive evolvingWins / evolvingLosses / evolvingDraws
// from EloHistory rows where eloType='evolving', and subtract those counts
// from the legacy wins / losses / draws fields (which incremented for both
// ranked AND evolving games up until 2026-05-16).
//
// Reads DATABASE_URL from .env (or directly from env if already set).
// Run with:   node scripts/_backfill-evolving-stats.mjs
// Or dry-run: node scripts/_backfill-evolving-stats.mjs --dry
//
// Delete the script after running it.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

try {
  const raw = readFileSync(resolve(root, '.env'), 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["'](.*)["']$/, '$1');
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* .env not found, rely on existing env */ }

const DRY = process.argv.includes('--dry');

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log(`[Backfill] Mode: ${DRY ? 'DRY-RUN (no writes)' : 'LIVE (writes)'}`);

  const evolvingRows = await prisma.eloHistory.findMany({
    where: { eloType: 'evolving' },
    select: { userId: true, result: true },
  });
  console.log(`[Backfill] Found ${evolvingRows.length} evolving EloHistory rows`);

  const perUser = new Map();
  for (const row of evolvingRows) {
    if (!perUser.has(row.userId)) {
      perUser.set(row.userId, { wins: 0, losses: 0, draws: 0 });
    }
    const stats = perUser.get(row.userId);
    if (row.result === 'win') stats.wins++;
    else if (row.result === 'loss') stats.losses++;
    else if (row.result === 'draw') stats.draws++;
  }
  console.log(`[Backfill] ${perUser.size} unique users have evolving history`);

  let updated = 0;
  let skipped = 0;
  for (const [userId, stats] of perUser) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, wins: true, losses: true, draws: true, evolvingWins: true, evolvingLosses: true, evolvingDraws: true, evolvingGamesPlayed: true },
    });
    if (!user) { skipped++; continue; }

    const totalEvolving = stats.wins + stats.losses + stats.draws;
    const newRankedWins = Math.max(0, user.wins - stats.wins);
    const newRankedLosses = Math.max(0, user.losses - stats.losses);
    const newRankedDraws = Math.max(0, user.draws - stats.draws);
    const newEvolvingGamesPlayed = Math.max(user.evolvingGamesPlayed, totalEvolving);

    console.log(`  ${user.username.padEnd(24)} ranked=${user.wins}/${user.losses}/${user.draws} -> ${newRankedWins}/${newRankedLosses}/${newRankedDraws} | evolving=+${stats.wins}/+${stats.losses}/+${stats.draws} (games=${newEvolvingGamesPlayed})`);

    if (!DRY) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          wins: newRankedWins,
          losses: newRankedLosses,
          draws: newRankedDraws,
          evolvingWins: stats.wins,
          evolvingLosses: stats.losses,
          evolvingDraws: stats.draws,
          evolvingGamesPlayed: newEvolvingGamesPlayed,
        },
      });
    }
    updated++;
  }

  console.log(`\n[Backfill] Done. ${updated} users updated, ${skipped} skipped (missing user record).`);
  if (DRY) {
    console.log('[Backfill] DRY-RUN, no changes persisted. Re-run without --dry to apply.');
  } else {
    console.log('[Backfill] Delete this script: rm scripts/_backfill-evolving-stats.mjs');
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('[Backfill] Unexpected error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
