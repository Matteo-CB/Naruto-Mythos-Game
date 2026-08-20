import {
  NWL_FIRST_PLACE_STORE_CREDIT_GBP,
  NWL_CHUNIN_PODIUM_PLACES,
  NWL_DISCORD_INVITE,
} from '@/lib/tournament/weeklySchedule';

const DISCORD_API = 'https://discord.com/api/v10';

export const NWL_PARTNER_KEY = 'nwl';
export const NWL_GUILD_ID = '1396218672858534080';
export const NWL_CHUNIN_ROLE_ID = '1504440900783308820';
export const NWL_TAG_CHANNEL_ID = '1396218674486055023';
export const NWL_INVITE_URL = 'https://discord.gg/UXQX8McFD3';
export const NWL_APP_ID = '1530185831841534048';
export const NWL_PRIZE_TOP_N = 3;
export const NWL_ANNOUNCEMENT_IMAGE = '/images/tournaments/nwl-friday.webp';
export const NWL_TOURNAMENT_NAME = 'Friday Free Genin Tournament';
export const NWL_MAX_PLAYERS = 32;
export const NWL_START_HOUR = 22;

export interface NwlPodiumEntry {
  place: 1 | 2 | 3;
  userId: string;
  username: string;
  discordId: string | null;
}

export type NwlMembership = 'member' | 'not_member' | 'unavailable';
export type NwlGrantResult = 'granted' | 'not_member' | 'unavailable';

export interface NwlPodiumGrantResult {
  grantedUserIds: string[];
  grantedEntries: NwlPodiumEntry[];
  skippedNoDiscord: NwlPodiumEntry[];
  allEligibleHandled: boolean;
}

function botToken(): string | undefined {
  return process.env.NWL_BOT_TOKEN;
}

async function nwlApi(path: string, init?: RequestInit, retries = 3): Promise<Response | null> {
  const token = botToken();
  if (!token) {
    console.error('[NWL] NWL_BOT_TOKEN is not set; Discord operations are unavailable.');
    return null;
  }
  try {
    const res = await fetch(`${DISCORD_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bot ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 429 && retries > 0) {
      const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
      const retryAfter = (body.retry_after ?? 1) * 1000;
      console.warn(`[NWL] Rate limited on ${path}, retrying after ${retryAfter}ms`);
      await new Promise((resolve) => setTimeout(resolve, retryAfter + 100));
      return nwlApi(path, init, retries - 1);
    }
    if (res.status >= 500 && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return nwlApi(path, init, retries - 1);
    }
    return res;
  } catch {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      return nwlApi(path, init, retries - 1);
    }
    return null;
  }
}

export async function checkNwlMembership(discordId: string | null | undefined): Promise<NwlMembership> {
  if (!discordId) return 'not_member';
  const res = await nwlApi(`/guilds/${NWL_GUILD_ID}/members/${discordId}`);
  if (!res) return 'unavailable';
  if (res.status === 200) return 'member';
  if (res.status === 404) return 'not_member';
  return 'unavailable';
}

export async function isNwlMember(discordId: string | null | undefined): Promise<boolean> {
  return (await checkNwlMembership(discordId)) === 'member';
}

export async function grantNwlChuninRole(discordId: string | null | undefined): Promise<NwlGrantResult> {
  if (!discordId) return 'not_member';
  const res = await nwlApi(
    `/guilds/${NWL_GUILD_ID}/members/${discordId}/roles/${NWL_CHUNIN_ROLE_ID}`,
    { method: 'PUT' },
  );
  if (!res) return 'unavailable';
  if (res.status === 204 || res.status === 200) return 'granted';
  if (res.status === 404) return 'not_member';
  return 'unavailable';
}

export const NWL_CHUNIN_RESET_WEEKDAY = 1;

export const NWL_TOURNAMENT_RULES_NOTE = [
  'New World Loot weekly Friday tournament. Single elimination, standard ban list.',
  `Rewards. First place wins £${NWL_FIRST_PLACE_STORE_CREDIT_GBP} of store credit, offered by New World Loot.`,
  `The first ${NWL_CHUNIN_PODIUM_PLACES} players also earn the Chunin role. It lets you enter the Chunin tournament held the next day, where the rewards are bigger. Details on the New World Loot Discord server.`,
  'The Chunin role counts for that next Chunin tournament only: it is removed every Monday, so it has to be earned again each week.',
  `To receive the Chunin role you must link your Discord account and be a member of the New World Loot server: ${NWL_DISCORD_INVITE}`,
].join(' ');

export async function listNwlChuninHolders(): Promise<string[] | null> {
  const holders: string[] = [];
  let after = '0';
  for (let page = 0; page < 20; page++) {
    const res = await nwlApi(`/guilds/${NWL_GUILD_ID}/members?limit=1000&after=${after}`);
    if (!res || res.status !== 200) return null;
    const members = (await res.json().catch(() => null)) as Array<{ user?: { id?: string }; roles?: string[] }> | null;
    if (!Array.isArray(members) || members.length === 0) break;
    for (const m of members) {
      const id = m.user?.id;
      if (id && Array.isArray(m.roles) && m.roles.includes(NWL_CHUNIN_ROLE_ID)) holders.push(id);
    }
    const last = members[members.length - 1]?.user?.id;
    if (!last || members.length < 1000) break;
    after = last;
  }
  return holders;
}

export async function revokeNwlChuninRole(discordId: string): Promise<NwlGrantResult> {
  const res = await nwlApi(
    `/guilds/${NWL_GUILD_ID}/members/${discordId}/roles/${NWL_CHUNIN_ROLE_ID}`,
    { method: 'DELETE' },
  );
  if (!res) return 'unavailable';
  if (res.status === 204 || res.status === 200) return 'granted';
  if (res.status === 404) return 'not_member';
  return 'unavailable';
}

export async function revokeAllNwlChuninRoles(): Promise<{ revoked: number; failed: number; listed: number } | null> {
  const holders = await listNwlChuninHolders();
  if (holders === null) {
    console.error('[NWL] could not list Chunin holders, weekly reset skipped');
    return null;
  }
  let revoked = 0;
  let failed = 0;
  for (const discordId of holders) {
    const result = await revokeNwlChuninRole(discordId);
    if (result === 'unavailable') failed++;
    else revoked++;
  }
  console.log(`[NWL] weekly Chunin reset: listed ${holders.length}, revoked ${revoked}, failed ${failed}`);
  return { revoked, failed, listed: holders.length };
}

export async function grantNwlPodiumRoles(podium: NwlPodiumEntry[]): Promise<NwlPodiumGrantResult> {
  const grantedUserIds: string[] = [];
  const grantedEntries: NwlPodiumEntry[] = [];
  const skippedNoDiscord: NwlPodiumEntry[] = [];
  let allEligibleHandled = true;
  for (const e of podium) {
    if (!e.discordId) {
      skippedNoDiscord.push(e);
      continue;
    }
    const result = await grantNwlChuninRole(e.discordId);
    if (result === 'granted') {
      grantedUserIds.push(e.userId);
      grantedEntries.push(e);
    } else if (result === 'unavailable') {
      allEligibleHandled = false;
    }
  }
  if (skippedNoDiscord.length > 0) {
    console.warn(
      `[NWL] ${skippedNoDiscord.length} podium finisher(s) have no linked Discord and cannot receive Chunin: ` +
        skippedNoDiscord.map((e) => e.username).join(', '),
    );
  }
  return { grantedUserIds, grantedEntries, skippedNoDiscord, allEligibleHandled };
}

function joinReadable(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function presentNwlFinisher(e: NwlPodiumEntry): string {
  return e.discordId ? `**${e.username}** (<@${e.discordId}>)` : `**${e.username}**`;
}

export async function announceNwlPodium(entries: NwlPodiumEntry[]): Promise<boolean> {
  const byPlace = (place: 1 | 2 | 3) => entries.filter((e) => e.place === place);
  const champions = byPlace(1);
  const finalists = byPlace(2);
  const thirds = byPlace(3);

  const lines: string[] = [`The **${NWL_TOURNAMENT_NAME}** is over, and here is how it finished.`, ''];

  if (champions.length) {
    lines.push(`1st place: ${joinReadable(champions.map(presentNwlFinisher))}`);
    const names = joinReadable(champions.map((e) => `**${e.username}**`));
    lines.push(
      champions.length > 1
        ? `Congratulations to ${names}, champions of this week's New World Loot tournament.`
        : `Congratulations to ${names}, champion of this week's New World Loot tournament.`,
    );
    lines.push('');
  }
  if (finalists.length) lines.push(`2nd place: ${joinReadable(finalists.map(presentNwlFinisher))}`);
  if (thirds.length) lines.push(`3rd place: ${joinReadable(thirds.map(presentNwlFinisher))}`);
  if (finalists.length || thirds.length) lines.push('');

  lines.push(
    entries.length > 1
      ? 'Each of you has received the Chunin role on this server. Well played.'
      : 'The Chunin role has been added to your profile on this server. Well played.',
  );
  lines.push('');
  lines.push(
    `Rewards: first place wins £${NWL_FIRST_PLACE_STORE_CREDIT_GBP} of store credit, offered by New World Loot.`,
  );
  lines.push(
    'The Chunin role lets you enter the Chunin tournament held the next day, where the rewards are bigger. Details on this server. It counts for that one only, as the role is removed every Monday.',
  );

  const res = await nwlApi(`/channels/${NWL_TAG_CHANNEL_ID}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: lines.join('\n'),
      allowed_mentions: { parse: [], users: entries.map((e) => e.discordId).filter((x): x is string => !!x) },
    }),
  });
  return res?.status === 200 || res?.status === 201;
}
