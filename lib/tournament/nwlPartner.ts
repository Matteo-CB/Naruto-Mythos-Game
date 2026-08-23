import {
  NWL_FIRST_PLACE_STORE_CREDIT_GBP,
  NWL_CHUNIN_PODIUM_PLACES,
  NWL_DISCORD_INVITE,
} from '@/lib/tournament/weeklySchedule';

const DISCORD_API = 'https://discord.com/api/v10';

export const NWL_PARTNER_KEY = 'nwl';
export const NWL_TOURNAMENT_OWNER_USERNAME = 'New_World_Loot';
export const NWL_GUILD_ID = '1396218672858534080';
export const NWL_CHUNIN_ROLE_ID = '1504440900783308820';
export const NWL_CHUNIN_SUBSCRIBER_ROLE_ID = '';
export const NWL_TAG_CHANNEL_ID = '1396218674486055023';
export const NWL_INVITE_URL = 'https://discord.gg/UXQX8McFD3';
export const NWL_STORE_URL = 'https://www.newworldloot.com/collections/naruto-mythos';
export const NWL_TOURNAMENTS_URL = 'https://narutomythosgame.com/en/tournaments';
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
  gagnesEnTournoi: string[];
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

export type NwlRoleCheck = 'has_role' | 'no_role' | 'not_member' | 'unavailable';

export async function checkNwlRole(
  discordId: string | null | undefined,
  roleId: string,
): Promise<NwlRoleCheck> {
  return checkNwlAnyRole(discordId, [roleId]);
}

export async function checkNwlAnyRole(
  discordId: string | null | undefined,
  roleIds: string[],
): Promise<NwlRoleCheck> {
  if (!discordId) return 'not_member';
  const attendus = roleIds.filter(Boolean);
  if (attendus.length === 0) return 'no_role';
  const res = await nwlApi(`/guilds/${NWL_GUILD_ID}/members/${discordId}`);
  if (!res) return 'unavailable';
  if (res.status === 404) return 'not_member';
  if (res.status !== 200) return 'unavailable';
  const membre = (await res.json().catch(() => null)) as { roles?: string[] } | null;
  if (!membre || !Array.isArray(membre.roles)) return 'unavailable';
  return attendus.some((r) => membre.roles!.includes(r)) ? 'has_role' : 'no_role';
}

export async function grantNwlRole(
  discordId: string | null | undefined,
  roleId: string,
): Promise<NwlGrantResult> {
  if (!discordId) return 'not_member';
  const res = await nwlApi(
    `/guilds/${NWL_GUILD_ID}/members/${discordId}/roles/${roleId}`,
    { method: 'PUT' },
  );
  if (!res) return 'unavailable';
  if (res.status === 204 || res.status === 200) return 'granted';
  if (res.status === 404) return 'not_member';
  return 'unavailable';
}

export async function revokeNwlRole(discordId: string, roleId: string): Promise<NwlGrantResult> {
  const res = await nwlApi(
    `/guilds/${NWL_GUILD_ID}/members/${discordId}/roles/${roleId}`,
    { method: 'DELETE' },
  );
  if (!res) return 'unavailable';
  if (res.status === 204 || res.status === 200) return 'granted';
  if (res.status === 404) return 'not_member';
  return 'unavailable';
}

export async function grantNwlChuninRole(discordId: string | null | undefined): Promise<NwlGrantResult> {
  return grantNwlRole(discordId, NWL_CHUNIN_ROLE_ID);
}

export const NWL_TOURNAMENT_RULES_NOTE = [
  'New World Loot weekly Friday tournament. Single elimination, standard ban list.',
  `Rewards. First place wins £${NWL_FIRST_PLACE_STORE_CREDIT_GBP} of store credit, offered by New World Loot.`,
  `The first ${NWL_CHUNIN_PODIUM_PLACES} players also earn the Chunin role. It lets you enter the Chunin tournament held the next day, where the rewards are bigger. Details on the New World Loot Discord server.`,
  'A Chunin role won here lasts 3 days, long enough for the Chunin tournament the next day, then it is removed automatically. A Chunin role obtained any other way is never touched.',
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
  return revokeNwlRole(discordId, NWL_CHUNIN_ROLE_ID);
}

export async function revokeNwlChuninRolesFor(
  discordIds: string[],
): Promise<{ revoked: number; failed: number; listed: number; restants: string[] }> {
  const cibles = [...new Set(discordIds.filter(Boolean))];
  let revoked = 0;
  const restants: string[] = [];
  for (const discordId of cibles) {
    const result = await revokeNwlChuninRole(discordId);
    if (result === 'unavailable') restants.push(discordId);
    else revoked++;
  }
  console.log(`[NWL] weekly Chunin reset: listed ${cibles.length}, revoked ${revoked}, failed ${restants.length}`);
  return { revoked, failed: restants.length, listed: cibles.length, restants };
}

export async function grantNwlPodiumRoles(podium: NwlPodiumEntry[]): Promise<NwlPodiumGrantResult> {
  const grantedUserIds: string[] = [];
  const grantedEntries: NwlPodiumEntry[] = [];
  const skippedNoDiscord: NwlPodiumEntry[] = [];
  const gagnesEnTournoi: string[] = [];
  let allEligibleHandled = true;
  for (const e of podium) {
    if (!e.discordId) {
      skippedNoDiscord.push(e);
      continue;
    }
    const avant = await checkNwlRole(e.discordId, NWL_CHUNIN_ROLE_ID);
    const result = await grantNwlChuninRole(e.discordId);
    if (result === 'granted') {
      grantedUserIds.push(e.userId);
      grantedEntries.push(e);
      if (avant === 'no_role') gagnesEnTournoi.push(e.discordId);
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
  return { grantedUserIds, grantedEntries, skippedNoDiscord, allEligibleHandled, gagnesEnTournoi };
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

export const NWL_NARUTO_MYTHOS_ROLE_ID = '1500156919971577968';
export const NWL_JONIN_ROLE_ID = '1523084007854833728';
export const NWL_KAGE_ROLE_ID = '1504441360059469875';
export const NWL_KAGE_CHAMPIONS_MAX = 3;
export const NWL_ANNOUNCE_CHANNEL_ID = '1539215631629418588';
export const NWL_CHUNIN_ANNOUNCE_CHANNEL_ID = '1540492429017481296';
export const NWL_MOD_CHANNEL_ID = '1396225805381664791';
export const NWL_LEADERBOARD_CHANNEL_ID = '1538844100898324491';
export const NWL_DECKS_CHANNEL_ID = '1539216467885555734';

export interface NwlMessageRef {
  channelId: string;
  messageId: string;
}

export async function nwlPostMessage(
  channelId: string,
  content: string,
  roleToPing?: string,
  usersToPing?: string[],
): Promise<NwlMessageRef | null> {
  const roles = roleToPing ? [roleToPing] : [];
  const users = (usersToPing ?? []).filter(Boolean);
  const res = await nwlApi(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      allowed_mentions: roles.length > 0 || users.length > 0 ? { roles, users } : { parse: [] },
    }),
  });
  if (!res || (res.status !== 200 && res.status !== 201)) return null;
  const body = (await res.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return null;
  return { channelId, messageId: body.id };
}

export async function nwlPostForumThread(
  channelId: string,
  name: string,
  content: string,
): Promise<NwlMessageRef | null> {
  const res = await nwlApi(`/channels/${channelId}/threads`, {
    method: 'POST',
    body: JSON.stringify({
      name: name.slice(0, 100),
      message: { content: content.slice(0, 2000), allowed_mentions: { parse: [] } },
    }),
  });
  if (!res || (res.status !== 200 && res.status !== 201)) return null;
  const body = (await res.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return null;
  return { channelId: body.id, messageId: body.id };
}

export async function nwlEditMessage(ref: NwlMessageRef, content: string): Promise<boolean> {
  const res = await nwlApi(`/channels/${ref.channelId}/messages/${ref.messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
  return !!res && res.status === 200;
}

export async function nwlSendDirectMessage(discordId: string, content: string): Promise<boolean> {
  const canal = await nwlApi('/users/@me/channels', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: discordId }),
  });
  if (!canal || (canal.status !== 200 && canal.status !== 201)) return false;
  const body = (await canal.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return false;
  const envoi = await nwlPostMessage(body.id, content);
  return envoi !== null;
}

export async function listNwlRoleHolders(roleId: string): Promise<string[] | null> {
  const holders: string[] = [];
  let after = '0';
  for (let page = 0; page < 20; page++) {
    const res = await nwlApi(`/guilds/${NWL_GUILD_ID}/members?limit=1000&after=${after}`);
    if (!res || res.status !== 200) return null;
    const members = (await res.json().catch(() => null)) as Array<{ user?: { id?: string }; roles?: string[] }> | null;
    if (!Array.isArray(members) || members.length === 0) break;
    for (const m of members) {
      const id = m.user?.id;
      if (id && Array.isArray(m.roles) && m.roles.includes(roleId)) holders.push(id);
    }
    const last = members[members.length - 1]?.user?.id;
    if (!last || members.length < 1000) break;
    after = last;
  }
  return holders;
}
