interface TournamentLike {
  name: string;
  format: string;
  gameMode: string;
  maxPlayers: number;
  scheduledStartAt: Date | null;
  creatorUsername: string;
  allowedLeagues?: string[];
  bannedCardIds?: string[];
  allowedGroups?: string[];
  bannedGroups?: string[];
  allowedKeywords?: string[];
  bannedKeywords?: string[];
  allowedRarities?: string[];
  bannedRarities?: string[];
  maxPerRarity?: unknown;
  maxCopiesPerCard?: number | null;
  minDeckSize?: number | null;
  maxDeckSize?: number | null;
  maxChakraCost?: number | null;
  restrictionNote?: string | null;
}

function formatLabel(format: string): string {
  if (format === 'swiss') return 'Swiss';
  if (format === 'elimination') return 'Single Elimination';
  if (format === 'double_elimination') return 'Double Elimination';
  return format;
}

function gameModeLabel(mode: string): string {
  if (mode === 'classic') return 'Classic';
  if (mode === 'sealed') return 'Sealed';
  if (mode === 'evolving') return 'Evolving';
  if (mode === 'restricted') return 'Restricted';
  return mode;
}

export function buildRestrictionSummary(t: TournamentLike): string | null {
  const parts: string[] = [];
  if (t.allowedLeagues && t.allowedLeagues.length > 0) {
    parts.push(`Leagues allowed: ${t.allowedLeagues.join(', ')}`);
  }
  if (t.bannedCardIds && t.bannedCardIds.length > 0) {
    parts.push(`${t.bannedCardIds.length} card${t.bannedCardIds.length > 1 ? 's' : ''} banned`);
  }
  if (t.allowedGroups && t.allowedGroups.length > 0) {
    parts.push(`Groups allowed: ${t.allowedGroups.join(', ')}`);
  }
  if (t.bannedGroups && t.bannedGroups.length > 0) {
    parts.push(`Groups banned: ${t.bannedGroups.join(', ')}`);
  }
  if (t.allowedKeywords && t.allowedKeywords.length > 0) {
    parts.push(`Keywords allowed: ${t.allowedKeywords.join(', ')}`);
  }
  if (t.bannedKeywords && t.bannedKeywords.length > 0) {
    parts.push(`Keywords banned: ${t.bannedKeywords.join(', ')}`);
  }
  if (t.allowedRarities && t.allowedRarities.length > 0) {
    parts.push(`Rarities allowed: ${t.allowedRarities.join(', ')}`);
  }
  if (t.bannedRarities && t.bannedRarities.length > 0) {
    parts.push(`Rarities banned: ${t.bannedRarities.join(', ')}`);
  }
  if (typeof t.maxCopiesPerCard === 'number') {
    parts.push(`Max ${t.maxCopiesPerCard} copies per card`);
  }
  if (typeof t.minDeckSize === 'number') {
    parts.push(`Min deck size ${t.minDeckSize}`);
  }
  if (typeof t.maxDeckSize === 'number') {
    parts.push(`Max deck size ${t.maxDeckSize}`);
  }
  if (typeof t.maxChakraCost === 'number') {
    parts.push(`Max chakra cost ${t.maxChakraCost}`);
  }
  if (t.restrictionNote && t.restrictionNote.trim().length > 0) {
    parts.push(t.restrictionNote.trim());
  }
  if (parts.length === 0) return null;
  return parts.join('. ');
}

export async function sendTournamentCreated(t: TournamentLike): Promise<void> {
  const webhookUrl = process.env.TOURNAMENT_PLANNING_WEBHOOK;
  if (!webhookUrl) {
    console.warn('[TournamentCreatedWebhook] TOURNAMENT_PLANNING_WEBHOOK not set, skipping announcement');
    return;
  }
  const tournamentRoleId = process.env.TOURNAMENT_ROLE_ID;

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: 'Format', value: formatLabel(t.format), inline: true },
    { name: 'Game mode', value: gameModeLabel(t.gameMode), inline: true },
    { name: 'Max players', value: String(t.maxPlayers), inline: true },
  ];

  if (t.scheduledStartAt) {
    const unix = Math.floor(new Date(t.scheduledStartAt).getTime() / 1000);
    fields.push({ name: 'Starts', value: `<t:${unix}:F>` });
    fields.push({ name: 'Countdown', value: `<t:${unix}:R>` });
  }

  const restriction = buildRestrictionSummary(t);
  if (restriction) {
    fields.push({ name: 'Restrictions', value: restriction });
  }

  fields.push({
    name: 'How to join',
    value: 'Open Naruto Mythos TCG, go to the Tournaments page, and join this tournament from there. Link your Discord account in your profile so your result and any role reward reach you on this server.',
  });

  const embed = {
    title: `New tournament: ${t.name}`,
    description: t.scheduledStartAt
      ? 'Sign-ups are open. Join from the app to take a seat, then submit your deck before the deck submission window closes.'
      : 'Sign-ups are open. Join from the app to take a seat. Start time will be announced soon.',
    color: 0xc4a35a,
    fields,
    footer: { text: `Created by ${t.creatorUsername}` },
    timestamp: new Date().toISOString(),
  };

  const content = tournamentRoleId ? `<@&${tournamentRoleId}>` : undefined;
  const allowedMentions = tournamentRoleId ? { roles: [tournamentRoleId] } : { parse: [] };

  console.log(`[TournamentCreatedWebhook] Posting announcement for "${t.name}" (role mention: ${tournamentRoleId ? 'yes' : 'no'})`);

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        embeds: [embed],
        allowed_mentions: allowedMentions,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '(could not read body)');
      if (res.status === 401 || res.status === 404) {
        console.error(`[TournamentCreatedWebhook] CRITICAL: webhook returned ${res.status}, likely revoked or deleted. Body: ${body}`);
      } else {
        console.error(`[TournamentCreatedWebhook] Failed to post (${res.status}): ${body}`);
      }
      return;
    }
    console.log(`[TournamentCreatedWebhook] Announcement posted for "${t.name}"`);
  } catch (err) {
    console.error('[TournamentCreatedWebhook] Network error posting announcement:', err instanceof Error ? err.message : err);
  }
}
