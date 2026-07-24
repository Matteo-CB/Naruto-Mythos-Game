const DISCORD_API = 'https://discord.com/api/v10';

export const NWL_PARTNER_KEY = 'nwl';
export const NWL_GUILD_ID = '1396218672858534080';
export const NWL_CHUNIN_ROLE_ID = '1504440900783308820';
export const NWL_TAG_CHANNEL_ID = '1396218674486055023';
export const NWL_INVITE_URL = 'https://discord.gg/JR5HG4VUP';
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

export async function announceNwlPodium(entries: NwlPodiumEntry[]): Promise<boolean> {
  const mention = (e: NwlPodiumEntry) => (e.discordId ? `<@${e.discordId}>` : e.username);
  const first = entries.filter((e) => e.place === 1).map(mention);
  const second = entries.filter((e) => e.place === 2).map(mention);
  const third = entries.filter((e) => e.place === 3).map(mention);

  const lines: string[] = ['Weekly New World Loot tournament results'];
  if (first.length) lines.push(`1st place: ${first.join(', ')}`);
  if (second.length) lines.push(`2nd place: ${second.join(', ')}`);
  if (third.length) lines.push(`3rd place: ${third.join(' and ')}`);
  lines.push('Congratulations, you have received the Chunin role. Well played.');

  const res = await nwlApi(`/channels/${NWL_TAG_CHANNEL_ID}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: lines.join('\n'),
      allowed_mentions: { parse: [], users: entries.map((e) => e.discordId).filter((x): x is string => !!x) },
    }),
  });
  return res?.status === 200 || res?.status === 201;
}
