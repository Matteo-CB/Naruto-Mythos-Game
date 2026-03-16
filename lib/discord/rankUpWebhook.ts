/**
 * Discord webhook notification for rank-up events.
 *
 * Sends a message + rich embed to a Discord channel when a player reaches a new league tier.
 * Tags the player with @mention if they have linked Discord, otherwise uses **bold** username.
 */

import { getRoleForElo, getRankLabel } from './roles';

const PLACEMENT_MATCHES_REQUIRED = 5;

const WEBHOOK_URL = process.env.DISCORD_RANKUP_WEBHOOK_URL;
const DISCORD_API = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.BOT_DISCORD_TOKEN;
const GUILD_ID = process.env.SERVER_DISCORD_ID;

/** Check if a Discord user is actually a member of the guild */
async function isGuildMember(discordId: string): Promise<boolean> {
  if (!BOT_TOKEN || !GUILD_ID) return false;
  try {
    const res = await fetch(`${DISCORD_API}/guilds/${GUILD_ID}/members/${discordId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

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
 * Detect rank-up and send a Discord webhook notification.
 *
 * @param username - Player display name
 * @param discordId - Discord user ID (null if not linked)
 * @param oldElo - ELO before game
 * @param newElo - ELO after game
 * @param oldTotalGames - Games before
 * @param newTotalGames - Games after
 */
export async function sendRankUpNotification(
  username: string,
  discordId: string | null,
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

    // Case 1: placement completed
    if (wasUnranked && isNowRanked) {
      await sendWebhook({
        username, discordId, oldRank: null, newRank, newElo,
        color: TIER_COLORS[newRank] ?? 0x888888,
        isFirstPlacement: true,
      });
      return;
    }

    // Case 2: ranked player promoted
    if (!wasUnranked && newRole.minElo > oldRole.minElo) {
      await sendWebhook({
        username, discordId, oldRank, newRank, newElo,
        color: TIER_COLORS[newRank] ?? 0xC4A35A,
        isFirstPlacement: false,
      });
    }
  } catch (error) {
    console.error('[Discord] Rank-up webhook error:', error);
  }
}

/**
 * Send a rank-up notification for a specific user (testing / manual).
 */
export async function sendRankUpForUser(
  username: string,
  discordId: string | null,
  elo: number,
  totalGames: number,
): Promise<void> {
  if (!WEBHOOK_URL) return;
  if (totalGames < PLACEMENT_MATCHES_REQUIRED) return;

  const rank = getRankLabel(elo);

  await sendWebhook({
    username, discordId, oldRank: null, newRank: rank, newElo: elo,
    color: TIER_COLORS[rank] ?? 0x888888,
    isFirstPlacement: false,
  });
}

async function sendWebhook(params: {
  username: string;
  discordId: string | null;
  oldRank: string | null;
  newRank: string;
  newElo: number;
  color: number;
  isFirstPlacement: boolean;
}): Promise<void> {
  if (!WEBHOOK_URL) return;

  const { username, discordId, oldRank, newRank, newElo, color, isFirstPlacement } = params;
  const symbol = TIER_SYMBOLS[newRank] ?? '';

  // Player mention: @tag if Discord linked AND in the server, **bold name** otherwise
  const inGuild = discordId ? await isGuildMember(discordId) : false;
  const playerMention = (discordId && inGuild) ? `<@${discordId}>` : `**${username}**`;

  // Content message (visible above the embed, triggers the @mention notification)
  let content: string;
  if (isFirstPlacement) {
    content = `${playerMention} has completed placement and entered **${newRank}** ${symbol}`;
  } else if (oldRank) {
    content = `${playerMention} ranked up from **${oldRank}** to **${newRank}** ${symbol}`;
  } else {
    content = `${playerMention} reached **${newRank}** ${symbol}`;
  }

  // Decorative separator for the embed description
  const bar = '\u2500'.repeat(20);

  const embed = {
    description: [
      `${bar}`,
      '',
      `${symbol}  **${newRank}**  ${symbol}`,
      '',
      `ELO: **${newElo}**`,
      '',
      `${bar}`,
    ].join('\n'),
    color,
    footer: {
      text: 'Naruto Mythos TCG Simulator',
    },
    timestamp: new Date().toISOString(),
  };

  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      embeds: [embed],
    }),
  });
}
