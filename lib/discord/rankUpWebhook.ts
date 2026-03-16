/**
 * Discord webhook notification for rank-up events.
 *
 * Sends a rich embed to a Discord channel when a player reaches a new league tier
 * (including going from unranked to their first league).
 */

import { getRoleForElo, getRankLabel } from './roles';
import { PLACEMENT_MATCHES_REQUIRED } from '@/components/EloBadge';

const WEBHOOK_URL = process.env.DISCORD_RANKUP_WEBHOOK_URL;

// Tier color map for embeds (Discord uses decimal color integers)
const TIER_COLORS: Record<string, number> = {
  'Academy Student': 0x888888,
  'Genin': 0x3E8B3E,
  'Chunin': 0xB37E3E,
  'Special Jonin': 0x5A7ABB,
  'Elite Jonin': 0x5865F2,
  'Legendary Sannin': 0x9B59B6,
  'Kage': 0xC4A35A,
  'Sage of Six Paths': 0xFFD700,
};

// Tier symbols for visual flair
const TIER_SYMBOLS: Record<string, string> = {
  'Academy Student': '\u2022',
  'Genin': '\u25C6',
  'Chunin': '\u25C6\u25C6',
  'Special Jonin': '\u2726',
  'Elite Jonin': '\u2726\u2726',
  'Legendary Sannin': '\u2605',
  'Kage': '\u2605\u2605',
  'Sage of Six Paths': '\u2605\u2605\u2605',
};

/**
 * Detect rank-up and send a Discord webhook notification if the player moved to a higher tier.
 */
export async function sendRankUpNotification(
  username: string,
  oldElo: number,
  newElo: number,
  oldTotalGames: number,
  newTotalGames: number,
): Promise<void> {
  if (!WEBHOOK_URL) return;

  try {
    const wasUnranked = oldTotalGames < PLACEMENT_MATCHES_REQUIRED;
    const isNowRanked = newTotalGames >= PLACEMENT_MATCHES_REQUIRED;

    const oldRole = getRoleForElo(oldElo);
    const newRole = getRoleForElo(newElo);
    const oldRank = getRankLabel(oldElo);
    const newRank = getRankLabel(newElo);
    const symbol = TIER_SYMBOLS[newRank] ?? '';

    // Case 1: Player just became ranked (placement completed)
    if (wasUnranked && isNowRanked) {
      await sendWebhook({
        username,
        oldRank: null,
        newRank,
        newElo,
        symbol,
        color: TIER_COLORS[newRank] ?? 0x888888,
        isFirstPlacement: true,
      });
      return;
    }

    // Case 2: Ranked player moved to a higher tier
    if (!wasUnranked && newRole.minElo > oldRole.minElo) {
      await sendWebhook({
        username,
        oldRank,
        newRank,
        newElo,
        symbol,
        color: TIER_COLORS[newRank] ?? 0xC4A35A,
        isFirstPlacement: false,
      });
      return;
    }
  } catch (error) {
    console.error('[Discord] Rank-up webhook error:', error);
  }
}

/**
 * Send a rank-up notification for a specific user (for testing / manual triggers).
 * Uses the user's current ELO and total games from the database.
 */
export async function sendRankUpForUser(
  username: string,
  elo: number,
  totalGames: number,
): Promise<void> {
  if (!WEBHOOK_URL) return;

  const rank = getRankLabel(elo);
  const symbol = TIER_SYMBOLS[rank] ?? '';
  const isUnranked = totalGames < PLACEMENT_MATCHES_REQUIRED;

  if (isUnranked) return; // Don't notify for unranked players

  await sendWebhook({
    username,
    oldRank: null,
    newRank: rank,
    newElo: elo,
    symbol,
    color: TIER_COLORS[rank] ?? 0x888888,
    isFirstPlacement: false,
  });
}

async function sendWebhook(params: {
  username: string;
  oldRank: string | null;
  newRank: string;
  newElo: number;
  symbol: string;
  color: number;
  isFirstPlacement: boolean;
}): Promise<void> {
  if (!WEBHOOK_URL) return;

  const { username, oldRank, newRank, newElo, symbol, color, isFirstPlacement } = params;

  const title = isFirstPlacement
    ? `${symbol}  New Ranked Player  ${symbol}`
    : `${symbol}  Rank Up  ${symbol}`;

  const description = isFirstPlacement
    ? `**${username}** completed placement and joined **${newRank}**`
    : oldRank
      ? `**${username}** promoted from **${oldRank}** to **${newRank}**`
      : `**${username}** reached **${newRank}**`;

  const embed = {
    title,
    description,
    color,
    fields: [
      { name: 'League', value: `${symbol} ${newRank}`, inline: true },
      { name: 'ELO', value: `**${newElo}**`, inline: true },
    ],
    footer: {
      text: 'Naruto Mythos TCG',
    },
    timestamp: new Date().toISOString(),
  };

  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });
}
