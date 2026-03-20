/**
 * Discord role sync utility.
 *
 * Uses Discord REST API directly (no discord.js at runtime).
 * Syncs a user's Discord ELO role based on their current ELO.
 * Roles are bi-directional: players gain AND lose roles based on current ELO.
 *
 * Discord role IDs are stored in SiteSettings.discordRoleIds as a JSON map:
 *   { "unranked": "123456789", "academy_student": "987654321", ... }
 */

import { prisma } from '@/lib/db/prisma';
import { getRoleForElo, ALL_ELO_ROLES, UNRANKED_ROLE, PLACEMENT_MATCHES_REQUIRED } from './roles';

const DISCORD_API = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.BOT_DISCORD_TOKEN;
const GUILD_ID = process.env.SERVER_DISCORD_ID;

type RoleIdMap = Record<string, string>; // key -> discord role id

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
 * Load the Discord role ID mapping from SiteSettings.
 * Returns null if not configured.
 */
async function loadRoleIdMap(): Promise<RoleIdMap | null> {
  const settings = await prisma.siteSettings.findUnique({
    where: { key: 'global' },
  });
  if (!settings?.discordRoleIds) return null;
  return settings.discordRoleIds as RoleIdMap;
}

/**
 * Sync a user's Discord ELO role based on their current ELO.
 *
 * Uses stored Discord role IDs from SiteSettings.discordRoleIds.
 * Bi-directional: assigns the role matching current ELO.
 * Removes ALL other ELO roles (both higher and lower).
 */
export async function syncDiscordRole(userId: string): Promise<void> {
  if (!BOT_TOKEN || !GUILD_ID) return;

  try {
    // Check if leagues are enabled
    const settings = await prisma.siteSettings.findUnique({
      where: { key: 'global' },
    });
    if (!settings?.leaguesEnabled) return;

    const roleIdMap = settings.discordRoleIds as RoleIdMap | null;
    if (!roleIdMap || Object.keys(roleIdMap).length === 0) {
      console.error('[Discord] No discordRoleIds configured in SiteSettings');
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { elo: true, discordId: true, wins: true, losses: true, draws: true, username: true },
    });

    if (!user?.discordId) return;

    const totalGames = (user.wins ?? 0) + (user.losses ?? 0) + (user.draws ?? 0);
    const isPlaced = totalGames >= PLACEMENT_MATCHES_REQUIRED;

    // Unranked players get the Unranked role, placed players get their ELO role
    const targetRole = isPlaced ? getRoleForElo(user.elo) : UNRANKED_ROLE;
    const targetRoleId = roleIdMap[targetRole.key];

    if (!targetRoleId) {
      console.error(`[Discord] No Discord role ID stored for key "${targetRole.key}". Run the admin Discord role setup.`);
      return;
    }

    console.log(`[Discord] Syncing role for ${user.username ?? userId}: ELO=${user.elo}, games=${totalGames}, placed=${isPlaced}, target="${targetRole.label}" (${targetRole.key})`);

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

    // Collect all stored ELO role IDs
    const allStoredRoleIds = new Set<string>();
    for (const role of ALL_ELO_ROLES) {
      const id = roleIdMap[role.key];
      if (id) allStoredRoleIds.add(id);
    }

    // Determine which roles need to be removed and if target needs to be added
    const rolesToRemove: Array<{ key: string; id: string }> = [];
    for (const role of ALL_ELO_ROLES) {
      const id = roleIdMap[role.key];
      if (id && id !== targetRoleId && member.roles.includes(id)) {
        rolesToRemove.push({ key: role.key, id });
      }
    }
    const needsTargetRole = !member.roles.includes(targetRoleId);

    // Nothing to do
    if (rolesToRemove.length === 0 && !needsTargetRole) {
      console.log(`[Discord] Role already correct for ${user.username ?? userId}: "${targetRole.label}"`);
      return;
    }

    // Remove all ELO roles that aren't the target
    for (const roleToRemove of rolesToRemove) {
      console.log(`[Discord] Removing role "${roleToRemove.key}" from ${user.username ?? userId}`);
      const removeRes = await discordFetch(
        `/guilds/${GUILD_ID}/members/${user.discordId}/roles/${roleToRemove.id}`,
        { method: 'DELETE' },
      );
      if (!removeRes.ok && removeRes.status !== 204) {
        console.error(`[Discord] Failed to remove role "${roleToRemove.key}" (${removeRes.status})`);
      }
      await delay(250);
    }

    // Add target role if not already present
    if (needsTargetRole) {
      console.log(`[Discord] Adding role "${targetRole.label}" to ${user.username ?? userId}`);
      const addRes = await discordFetch(
        `/guilds/${GUILD_ID}/members/${user.discordId}/roles/${targetRoleId}`,
        { method: 'PUT' },
      );
      if (!addRes.ok && addRes.status !== 204) {
        console.error(`[Discord] Failed to add role "${targetRole.label}" (${addRes.status})`);
      }
    }

    console.log(`[Discord] Role sync complete for ${user.username ?? userId}: "${targetRole.label}"`);
  } catch (error) {
    console.error('[Discord] Role sync error:', error);
  }
}

/**
 * Sync Discord roles for ALL users with linked Discord accounts.
 * Used by admin bulk-sync endpoint.
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
    await delay(500);
  }

  return { total: users.length, synced, errors };
}

/**
 * Invalidate the guild roles cache (kept for backward compat).
 */
export function invalidateRoleCache(): void {
  // No longer caching guild roles — using stored IDs from DB
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

    // Fetch guild roles to find by name
    const rolesRes = await discordFetch(`/guilds/${GUILD_ID}/roles`);
    if (!rolesRes.ok) {
      console.error('[Discord] Failed to fetch guild roles:', rolesRes.status);
      return;
    }
    const guildRoles = await rolesRes.json() as Array<{ id: string; name: string }>;
    let role = guildRoles.find((r) => r.name === roleName);

    if (!role) {
      // Create the role
      const createRes = await discordFetch(`/guilds/${GUILD_ID}/roles`, {
        method: 'POST',
        body: JSON.stringify({ name: roleName, color: 0xc4a35a, mentionable: false }),
      });
      if (!createRes.ok) {
        console.error('[Discord] Failed to create tournament role:', createRes.status);
        return;
      }
      role = await createRes.json() as { id: string; name: string };
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
