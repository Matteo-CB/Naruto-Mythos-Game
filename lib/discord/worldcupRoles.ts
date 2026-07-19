import { prisma } from '@/lib/db/prisma';
import { championRoleName, nationalTeamRoleName } from '@/lib/worldcup/season';

const BOT_TOKEN = process.env.BOT_DISCORD_TOKEN;
const GUILD_ID = process.env.SERVER_DISCORD_ID;
const CHAMPION_ROLE_COLOR = 0xffd700;
const TEAM_ROLE_COLOR = 0xc4a35a;

function configured(): boolean {
  return !!BOT_TOKEN && !!GUILD_ID;
}

async function discordFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
}

async function listRoles(): Promise<Array<{ id: string; name: string }>> {
  const res = await discordFetch(`/guilds/${GUILD_ID}/roles`);
  if (!res.ok) return [];
  return (await res.json()) as Array<{ id: string; name: string }>;
}

async function findRoleId(name: string): Promise<string | null> {
  const roles = await listRoles();
  return roles.find((r) => r.name === name)?.id ?? null;
}

async function findOrCreateRole(name: string, color: number): Promise<string | null> {
  const existing = await findRoleId(name);
  if (existing) return existing;
  const res = await discordFetch(`/guilds/${GUILD_ID}/roles`, {
    method: 'POST',
    body: JSON.stringify({ name, color, hoist: false, mentionable: false }),
  });
  if (!res.ok) return null;
  const role = (await res.json()) as { id: string };
  return role.id;
}

async function deleteRole(roleId: string): Promise<void> {
  await discordFetch(`/guilds/${GUILD_ID}/roles/${roleId}`, { method: 'DELETE' }).catch(() => {});
}

async function addRole(discordId: string, roleId: string): Promise<void> {
  await discordFetch(`/guilds/${GUILD_ID}/members/${discordId}/roles/${roleId}`, { method: 'PUT' }).catch(() => {});
}

async function removeRole(discordId: string, roleId: string): Promise<void> {
  await discordFetch(`/guilds/${GUILD_ID}/members/${discordId}/roles/${roleId}`, { method: 'DELETE' }).catch(() => {});
}

async function discordIdFor(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: 'discord' },
    select: { providerAccountId: true },
  }).catch(() => null);
  return account?.providerAccountId ?? null;
}

export async function assignChampionRoles(userIds: string[], endMonth: string, previousEndMonth: string | null): Promise<void> {
  if (!configured()) return;

  if (previousEndMonth) {
    const prevRoleId = await findRoleId(championRoleName(previousEndMonth));
    if (prevRoleId) await deleteRole(prevRoleId);
  }

  const roleId = await findOrCreateRole(championRoleName(endMonth), CHAMPION_ROLE_COLOR);
  if (!roleId) return;

  for (const userId of userIds) {
    const discordId = await discordIdFor(userId);
    if (discordId) await addRole(discordId, roleId);
  }
}

export interface DesiredTeamMember {
  userId: string;
  countryCode: string;
}

export async function syncNationalTeamRoles(desired: DesiredTeamMember[]): Promise<void> {
  if (!configured()) return;

  const desiredByUser = new Map(desired.map((d) => [d.userId, d.countryCode.toLowerCase()]));
  const current = await prisma.worldcupTeamMember.findMany().catch(() => []);
  const roleCache = new Map<string, string | null>();

  const roleFor = async (cc: string): Promise<string | null> => {
    if (roleCache.has(cc)) return roleCache.get(cc)!;
    const id = await findOrCreateRole(nationalTeamRoleName(cc), TEAM_ROLE_COLOR);
    roleCache.set(cc, id);
    return id;
  };

  for (const member of current) {
    const stillDesired = desiredByUser.get(member.userId);
    if (stillDesired === member.countryCode.toLowerCase()) continue;
    const discordId = await discordIdFor(member.userId);
    if (discordId) {
      const roleId = await roleFor(member.countryCode.toLowerCase());
      if (roleId) await removeRole(discordId, roleId);
    }
    await prisma.worldcupTeamMember.deleteMany({ where: { userId: member.userId } }).catch(() => {});
  }

  const currentByUser = new Map(current.map((m) => [m.userId, m.countryCode.toLowerCase()]));
  for (const { userId, countryCode } of desired) {
    const cc = countryCode.toLowerCase();
    if (currentByUser.get(userId) === cc) continue;
    const discordId = await discordIdFor(userId);
    if (discordId) {
      const roleId = await roleFor(cc);
      if (roleId) await addRole(discordId, roleId);
    }
    await prisma.worldcupTeamMember.upsert({
      where: { userId },
      create: { userId, countryCode: cc },
      update: { countryCode: cc },
    }).catch(() => {});
  }
}
