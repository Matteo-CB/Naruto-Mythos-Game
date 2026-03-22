import { prisma } from '@/lib/db/prisma';
import { isDiscordMember } from './tournamentRoles';

const WEBHOOK_URL = process.env.TOURNOI_WINNER_WEBHOOK;
const GUILD_ID = process.env.SERVER_DISCORD_ID;

interface PodiumEntry {
  userId: string;
  username: string;
  place: 1 | 2 | 3;
}

async function getDiscordMention(userId: string): Promise<string> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { accounts: { where: { provider: 'discord' } } },
    });
    if (user?.accounts[0]) {
      const discordId = user.accounts[0].providerAccountId;
      const isMember = await isDiscordMember(discordId);
      if (isMember) return `<@${discordId}>`;
    }
  } catch { /* fallback to username */ }
  return '';
}

/**
 * Send tournament results to Discord via webhook.
 */
export async function sendTournamentResults(
  tournamentName: string,
  podium: PodiumEntry[],
  totalParticipants: number,
  newRoleName: string | null,
): Promise<void> {
  if (!WEBHOOK_URL) {
    console.warn('[TournamentWebhook] TOURNOI_WINNER_WEBHOOK not set');
    return;
  }

  const winner = podium.find(p => p.place === 1);
  const finalist = podium.find(p => p.place === 2);
  const thirdPlace = podium.find(p => p.place === 3);

  if (!winner) return;

  const winnerMention = await getDiscordMention(winner.userId);
  const finalistMention = finalist ? await getDiscordMention(finalist.userId) : '';
  const thirdMention = thirdPlace ? await getDiscordMention(thirdPlace.userId) : '';

  const winnerDisplay = winnerMention ? `${winnerMention} (${winner.username})` : `**${winner.username}**`;
  const finalistDisplay = finalist
    ? (finalistMention ? `${finalistMention} (${finalist.username})` : finalist.username)
    : '';
  const thirdDisplay = thirdPlace
    ? (thirdMention ? `${thirdMention} (${thirdPlace.username})` : thirdPlace.username)
    : '';

  let description = `**${tournamentName}** is over!\n\n`;
  description += `1st ${winnerDisplay}\n`;
  if (finalistDisplay) description += `2nd ${finalistDisplay}\n`;
  if (thirdDisplay) description += `3rd ${thirdDisplay}\n`;
  description += `\n${totalParticipants} participants`;
  if (newRoleName) {
    description += `\n\n${winner.username} earned the role **${newRoleName}**`;
  }

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `Tournament Results`,
          description,
          color: 0xc4a35a,
          timestamp: new Date().toISOString(),
        }],
      }),
    });
    if (!res.ok) {
      console.error(`[TournamentWebhook] Failed to send: ${res.status}`);
    }
  } catch (err) {
    console.error('[TournamentWebhook] Error:', err);
  }
}
