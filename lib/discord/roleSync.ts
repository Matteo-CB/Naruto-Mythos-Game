/**
 * Discord role sync utility.
 *
 * Uses Discord REST API directly (no discord.js at runtime).
 * Syncs a user's Discord ELO role based on their current ELO.
 * Roles are bi-directional: players gain AND lose roles based on current ELO.
 */

import { prisma } from '@/lib/db/prisma';
import { getRoleForElo, getAllEloRoleNames, UNRANKED_ROLE, PLACEMENT_MATCHES_REQUIRED } from './roles';

const DISCORD_API = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.BOT_DISCORD_TOKEN;
const GUILD_ID = process.env.SERVER_DISCORD_ID;

interface DiscordRole {
  id: string;
  name: string;
}

/**
 * Discord REST fetch with automatic retry on rate-limit (429).
 */
async function discordFetch(path: string, options?: RequestInit, retries = 2): Promise<Response> {
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  // Handle rate limits with retry
  if (res.status === 429 && retries > 0) {
    const body = await res.json().catch(() => ({})) as { retry_after?: number };
    const retryAfter = (body.retry_after ?? 1) * 1000;
    console.warn(`[Discord] Rate limited, retrying after ${retryAfter}ms...`);
    await new Promise((resolve) => setTimeout(resolve, retryAfter + 100));
    return discordFetch(path, options, retries - 1);
  }

  return res;
}

/**
 * Small delay between Discord API calls to avoid rate limits.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
 * Removes ALL other ELO roles (both higher and lower).
 * Handles promotions, demotions, and placement transitions.
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
      select: { elo: true, discordId: true, wins: true, losses: true, draws: true, username: true },
    });

    if (!user?.discordId) return;

    const totalGames = (user.wins ?? 0) + (user.losses ?? 0) + (user.draws ?? 0);
    const isPlaced = totalGames >= PLACEMENT_MATCHES_REQUIRED;

    // Unranked players get the Unranked role, placed players get their ELO role
    const targetRole = isPlaced ? getRoleForElo(user.elo) : UNRANKED_ROLE;
    const allEloRoleNames = getAllEloRoleNames();

    console.log(`[Discord] Syncing role for ${user.username ?? userId}: ELO=${user.elo}, games=${totalGames}, placed=${isPlaced}, target="${targetRole.name}"`);

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
      console.error(`[Discord] Target role "${targetRole.name}" not found in guild. Available ELO roles: ${[...eloRoleMap.keys()].join(', ') || 'NONE'}`);
      return;
    }

    // Fetch member's current roles
    const memberRes = await discordFetch(`/guilds/${GUILD_ID}/members/${user.discordId}`);
    if (!memberRes.ok) {
      if (memberRes.status === 404) {
        console.log(`[Discord] User ${user.username ?? userId} not in guild, skipping`);
        return;
      }
      console.error('[Discord] Failed to fetch member:', memberRes.status);
      return;
    }
    const member = await memberRes.json() as { roles: string[] };

    // Determine which roles need to be removed and if target needs to be added
    const rolesToRemove: Array<{ name: string; id: string }> = [];
    for (const [roleName, roleId] of eloRoleMap) {
      if (roleName !== targetRole.name && member.roles.includes(roleId)) {
        rolesToRemove.push({ name: roleName, id: roleId });
      }
    }
    const needsTargetRole = !member.roles.includes(targetRoleId);

    // Nothing to do
    if (rolesToRemove.length === 0 && !needsTargetRole) {
      console.log(`[Discord] Role already correct for ${user.username ?? userId}: "${targetRole.name}"`);
      return;
    }

    // Remove all ELO roles that aren't the target
    for (const roleToRemove of rolesToRemove) {
      console.log(`[Discord] Removing role "${roleToRemove.name}" from ${user.username ?? userId}`);
      const removeRes = await discordFetch(
        `/guilds/${GUILD_ID}/members/${user.discordId}/roles/${roleToRemove.id}`,
        { method: 'DELETE' },
      );
      if (!removeRes.ok && removeRes.status !== 204) {
        console.error(`[Discord] Failed to remove role "${roleToRemove.name}" (${removeRes.status})`);
      }
      // Small delay between role operations to avoid rate limits
      await delay(250);
    }

    // Add target role if not already present
    if (needsTargetRole) {
      console.log(`[Discord] Adding role "${targetRole.name}" to ${user.username ?? userId}`);
      const addRes = await discordFetch(
        `/guilds/${GUILD_ID}/members/${user.discordId}/roles/${targetRoleId}`,
        { method: 'PUT' },
      );
      if (!addRes.ok && addRes.status !== 204) {
        console.error(`[Discord] Failed to add role "${targetRole.name}" (${addRes.status})`);
      }
    }

    console.log(`[Discord] Role sync complete for ${user.username ?? userId}: "${targetRole.name}"`);
  } catch (error) {
    console.error('[Discord] Role sync error:', error);
  }
}

/**
 * Sync Discord roles for ALL users with linked Discord accounts.
 * Used by admin bulk-sync endpoint.
 * Returns summary of results.
 */
export async function syncAllDiscordRoles(): Promise<{ total: number; synced: number; errors: number }> {
  if (!BOT_TOKEN || !GUILD_ID) return { total: 0, synced: 0, errors: 0 };

  const users = await prisma.user.findMany({
    where: { discordId: { not: null } },
    select: { id: true, username: true },
  });

  let synced = 0;
  let errors = 0;

  for (const user of users) {
    try {
      await syncDiscordRole(user.id);
      synced++;
    } catch {
      console.error(`[Discord] Bulk sync error for ${user.username}`);
      errors++;
    }
    // Delay between users to avoid rate limits
    await delay(500);
  }

  return { total: users.length, synced, errors };
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
