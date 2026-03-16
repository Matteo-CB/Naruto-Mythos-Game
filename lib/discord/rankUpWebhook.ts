/**
 * Discord webhook notification for rank-up events.
 *
 * Sends an embed to a Discord channel when a player reaches a new league tier
 * (including going from unranked to their first league).
 */

import { getRoleForElo, getRankLabel, type EloRole } from './roles';
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

/**
 * Detect rank-up and send a Discord webhook notification if the player moved to a higher tier.
 *
 * @param username - Player's display name
 * @param oldElo - ELO before the game
 * @param newElo - ELO after the game
 * @param oldTotalGames - Total games before this game
 * @param newTotalGames - Total games after this game
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

    // Case 1: Player just became ranked (placement completed)
    if (wasUnranked && isNowRanked) {
      await sendWebhook({
        username,
        description: `**${username}** completed placement matches and entered **${newRank}**!`,
        newRank,
        newElo,
        color: TIER_COLORS[newRank] ?? 0x888888,
        isFirstPlacement: true,
      });
      return;
    }

    // Case 2: Ranked player moved to a higher tier
    if (!wasUnranked && newRole.minElo > oldRole.minElo) {
      await sendWebhook({
        username,
        description: `**${username}** ranked up from **${oldRank}** to **${newRank}**!`,
        newRank,
        newElo,
        color: TIER_COLORS[newRank] ?? 0xC4A35A,
        isFirstPlacement: false,
      });
      return;
    }

    // No rank-up — do nothing
  } catch (error) {
    console.error('[Discord] Rank-up webhook error:', error);
  }
}

async function sendWebhook(params: {
  username: string;
  description: string;
  newRank: string;
  newElo: number;
  color: number;
  isFirstPlacement: boolean;
}): Promise<void> {
  if (!WEBHOOK_URL) return;

  const embed = {
    title: params.isFirstPlacement ? 'New Ranked Player' : 'Rank Up',
    description: params.description,
    color: params.color,
    fields: [
      { name: 'League', value: params.newRank, inline: true },
      { name: 'ELO', value: String(params.newElo), inline: true },
    ],
    timestamp: new Date().toISOString(),
  };

  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [embed],
    }),
  });
}
