import { prisma } from '@/lib/db/prisma';
import { isDiscordMember } from './tournamentRoles';

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

function presentFinisher(username: string, mention: string): string {
  return mention ? `**${username}** (${mention})` : `**${username}**`;
}


export async function sendTournamentResults(
  tournamentName: string,
  podium: PodiumEntry[],
  totalParticipants: number,
  newRoleName: string | null,
  isPublic?: boolean,
): Promise<void> {
  if (isPublic !== true) {
    console.log(`[TournamentWebhook] "${tournamentName}" is private, no Discord results announcement`);
    return;
  }
  const webhookUrl = process.env.TOURNOI_WINNER_WEBHOOK;
  if (!webhookUrl) {
    console.warn('[TournamentWebhook] TOURNOI_WINNER_WEBHOOK not set, skipping results announcement');
    return;
  }
  if (!podium || podium.length === 0) {
    console.warn(`[TournamentWebhook] Empty podium for "${tournamentName}", skipping announcement`);
    return;
  }

  const winner = podium.find(p => p.place === 1);
  const finalist = podium.find(p => p.place === 2);
  const thirdPlace = podium.find(p => p.place === 3);

  if (!winner) {
    console.warn(`[TournamentWebhook] No 1st place in podium for "${tournamentName}" (entries: ${podium.length}), skipping announcement`);
    return;
  }

  console.log(`[TournamentWebhook] Sending results for "${tournamentName}" podium=${podium.length} participants=${totalParticipants} role=${newRoleName ?? 'none'}`);

  const winnerMention = await getDiscordMention(winner.userId);
  const finalistMention = finalist ? await getDiscordMention(finalist.userId) : '';
  const thirdMention = thirdPlace ? await getDiscordMention(thirdPlace.userId) : '';

  const winnerDisplay = presentFinisher(winner.username, winnerMention);
  const finalistDisplay = finalist ? presentFinisher(finalist.username, finalistMention) : '';
  const thirdDisplay = thirdPlace ? presentFinisher(thirdPlace.username, thirdMention) : '';

  const fieldPhrase = totalParticipants >= 2 ? ` in a field of ${totalParticipants} players` : '';
  const paragraphs: string[] = [];
  paragraphs.push(`**${tournamentName}** is over, and it has a champion.`);

  let championParagraph = `Congratulations to ${winnerDisplay}, who took 1st place${fieldPhrase} and walks away with the title.`;
  if (newRoleName) {
    championParagraph += ` This run also earns ${winner.username} the **${newRoleName}** role.`;
  }
  paragraphs.push(championParagraph);

  if (finalistDisplay && thirdDisplay) {
    paragraphs.push(`${finalistDisplay} finished as runner-up, and ${thirdDisplay} completed the podium.`);
  } else if (finalistDisplay) {
    paragraphs.push(`${finalistDisplay} finished as runner-up.`);
  } else if (thirdDisplay) {
    paragraphs.push(`${thirdDisplay} completed the podium.`);
  }

  paragraphs.push('Well played to everyone who took part.');

  const description = paragraphs.join('\n\n');

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: '1st place', value: `**${winner.username}**`, inline: true },
  ];
  if (finalist) fields.push({ name: '2nd place', value: `**${finalist.username}**`, inline: true });
  if (thirdPlace) fields.push({ name: '3rd place', value: `**${thirdPlace.username}**`, inline: true });
  if (totalParticipants > 0) {
    fields.push({ name: 'Players', value: String(totalParticipants), inline: true });
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: `Tournament Results`,
          description,
          color: 0xc4a35a,
          fields,
          footer: { text: tournamentName },
          timestamp: new Date().toISOString(),
        }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '(could not read body)');
      if (res.status === 401 || res.status === 404) {
        console.error(`[TournamentWebhook] CRITICAL: webhook returned ${res.status}, likely revoked or deleted. Body: ${body}`);
      } else {
        console.error(`[TournamentWebhook] Failed to send (${res.status}): ${body}`);
      }
      return;
    }
    console.log(`[TournamentWebhook] Results posted for "${tournamentName}"`);
  } catch (err) {
    console.error('[TournamentWebhook] Network error sending results:', err instanceof Error ? err.message : err);
  }
}
