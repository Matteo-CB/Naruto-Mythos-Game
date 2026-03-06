/**
 * Discord role sync utility.
 *
 * Uses Discord REST API directly (no discord.js at runtime).
 * Syncs a user's Discord ELO role based on their current ELO.
 * Roles are bi-directional: players gain AND lose roles based on current ELO.
 */

import { prisma } from '@/lib/db/prisma';
import { getRoleForElo, getAllEloRoleNames } from './roles';

const DISCORD_API = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.BOT_DISCORD_TOKEN;
const GUILD_ID = process.env.SERVER_DISCORD_ID;

interface DiscordRole {
  id: string;
  name: string;
}

async function discordFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
}

/**
 * Get all roles in the guild, cached for 60 seconds.
 */
let cachedRoles: DiscordRole[] | null = null;
let cacheExpiry = 0;

async function getGuildRoles(): Promise<DiscordRole[]> {
  if (cachedRoles && Date.now() < cacheExpiry) return cachedRoles;

  const res = await discordFetch(`/guilds/${GUILD_ID}/roles`);
  if (!res.ok) {
    console.error('[Discord] Failed to fetch guild roles:', res.status);
    return [];
  }
  cachedRoles = await res.json() as DiscordRole[];
  cacheExpiry = Date.now() + 60_000;
  return cachedRoles;
}

/**
 * Invalidate the guild roles cache (after role creation/deletion).
 */
export function invalidateRoleCache(): void {
  cachedRoles = null;
  cacheExpiry = 0;
}

/**
 * Sync a user's Discord ELO role based on their current ELO.
 *
 * Bi-directional: assigns the role matching current ELO.
 * If ELO drops, the old higher role is removed.
 */
export async function syncDiscordRole(userId: string): Promise<void> {
  if (!BOT_TOKEN || !GUILD_ID) return;

  try {
    // Check if leagues are enabled
    const settings = await prisma.siteSettings.findUnique({
      where: { key: 'global' },
    });
    if (!settings?.leaguesEnabled) return;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { elo: true, discordId: true },
    });

    if (!user?.discordId) return;

    const targetRole = getRoleForElo(user.elo);
    const allEloRoleNames = getAllEloRoleNames();

    // Get guild roles
    const guildRoles = await getGuildRoles();
    const eloRoleMap = new Map<string, string>(); // name -> id
    for (const role of guildRoles) {
      if (allEloRoleNames.includes(role.name)) {
        eloRoleMap.set(role.name, role.id);
      }
    }

    const targetRoleId = eloRoleMap.get(targetRole.name);
    if (!targetRoleId) {
      console.error(`[Discord] Target role "${targetRole.name}" not found in guild`);
      return;
    }

    // Fetch member's current roles
    const memberRes = await discordFetch(`/guilds/${GUILD_ID}/members/${user.discordId}`);
    if (!memberRes.ok) {
      if (memberRes.status === 404) return; // User not in guild
      console.error('[Discord] Failed to fetch member:', memberRes.status);
      return;
    }
    const member = await memberRes.json() as { roles: string[] };

    // Remove all ELO roles that aren't the target
    for (const [roleName, roleId] of eloRoleMap) {
      if (roleName !== targetRole.name && member.roles.includes(roleId)) {
        await discordFetch(`/guilds/${GUILD_ID}/members/${user.discordId}/roles/${roleId}`, {
          method: 'DELETE',
        });
      }
    }

    // Add target role if not already present
    if (!member.roles.includes(targetRoleId)) {
      await discordFetch(`/guilds/${GUILD_ID}/members/${user.discordId}/roles/${targetRoleId}`, {
        method: 'PUT',
      });
    }
  } catch (error) {
    console.error('[Discord] Role sync error:', error);
  }
}


/**
 * Assign a tournament reward role to a player.
 * Creates the role in the guild if it does not exist.
 */
export async function assignTournamentRole(userId: string, roleName: string): Promise<void> {
  if (!BOT_TOKEN || !GUILD_ID || !roleName) return;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { discordId: true },
    });

    if (!user?.discordId) return;

    // Find or create the role
    let guildRoles = await getGuildRoles();
    let role = guildRoles.find((r) => r.name === roleName);

    if (!role) {
      // Create the role with a gold-ish color
      const createRes = await discordFetch(`/guilds/${GUILD_ID}/roles`, {
        method: 'POST',
        body: JSON.stringify({ name: roleName, color: 0xc4a35a, mentionable: false }),
      });
      if (!createRes.ok) {
        console.error('[Discord] Failed to create tournament role:', createRes.status);
        return;
      }
      role = await createRes.json() as DiscordRole;
      invalidateRoleCache();
    }

    // Assign the role to the member
    const res = await discordFetch(`/guilds/${GUILD_ID}/members/${user.discordId}/roles/${role.id}`, {
      method: 'PUT',
    });
    if (!res.ok && res.status !== 204) {
      console.error('[Discord] Failed to assign tournament role:', res.status);
    }
  } catch (error) {
    console.error('[Discord] Tournament role assign error:', error);
  }
}
