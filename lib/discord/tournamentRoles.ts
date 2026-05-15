import { prisma } from '@/lib/db/prisma';

const BOT_TOKEN = process.env.BOT_DISCORD_TOKEN;
const GUILD_ID = process.env.SERVER_DISCORD_ID;

const TOURNAMENT_ROLE_COLOR = 0xc4a35a; // Gold color matching the site accent


const TOURNAMENT_TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 50] as const;

function getRoleName(wins: number): string | null {
  if (wins >= 50) return 'Tournament Winner 50';
  if (wins >= 1 && wins <= 10) return `Tournament Winner ${wins}`;
  return null;
}

function getPreviousRoleName(wins: number): string | null {
  if (wins === 50) return 'Tournament Winner 10';
  if (wins > 10 && wins < 50) return null; // Keep "10", no change
  if (wins >= 2 && wins <= 10) return `Tournament Winner ${wins - 1}`;
  return null;
}

function getLegacyRoleName(wins: number): string | null {
  if (wins >= 50) return 'Vainqueur de tournoi 50';
  if (wins >= 1 && wins <= 10) return `Vainqueur de tournoi ${wins}`;
  return null;
}

async function discordFetch(path: string, options?: RequestInit): Promise<Response> {
  if (!BOT_TOKEN) throw new Error('BOT_DISCORD_TOKEN not set');
  return fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: {
      'Authorization': `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
}

async function findOrCreateRole(roleName: string, legacyAlias?: string | null): Promise<string> {
  if (!GUILD_ID) throw new Error('SERVER_DISCORD_ID not set');

  const rolesRes = await discordFetch(`/guilds/${GUILD_ID}/roles`);
  if (!rolesRes.ok) throw new Error(`Failed to fetch guild roles: ${rolesRes.status}`);
  const roles = await rolesRes.json();

  const existing = roles.find((r: { name: string }) => r.name === roleName);
  if (existing) return existing.id;

  if (legacyAlias) {
    const legacy = roles.find((r: { name: string }) => r.name === legacyAlias);
    if (legacy) {
      const patchRes = await discordFetch(`/guilds/${GUILD_ID}/roles/${legacy.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: roleName }),
      });
      if (patchRes.ok) {
        console.log(`[TournamentRoles] Migrated legacy role "${legacyAlias}" to "${roleName}"`);
        return legacy.id;
      }
      console.warn(`[TournamentRoles] Failed to rename legacy role "${legacyAlias}": ${patchRes.status}`);
    }
  }

  const createRes = await discordFetch(`/guilds/${GUILD_ID}/roles`, {
    method: 'POST',
    body: JSON.stringify({
      name: roleName,
      color: TOURNAMENT_ROLE_COLOR,
      hoist: true,
      mentionable: false,
    }),
  });
  if (!createRes.ok) throw new Error(`Failed to create role ${roleName}: ${createRes.status}`);
  const newRole = await createRes.json();
  return newRole.id;
}

async function addRole(discordId: string, roleId: string): Promise<void> {
  if (!GUILD_ID) return;
  const res = await discordFetch(`/guilds/${GUILD_ID}/members/${discordId}/roles/${roleId}`, {
    method: 'PUT',
  });
  if (!res.ok && res.status !== 204) {
    console.warn(`[TournamentRoles] Failed to add role ${roleId} to ${discordId}: ${res.status}`);
  }
}

async function removeRole(discordId: string, roleId: string): Promise<void> {
  if (!GUILD_ID) return;
  const res = await discordFetch(`/guilds/${GUILD_ID}/members/${discordId}/roles/${roleId}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    console.warn(`[TournamentRoles] Failed to remove role ${roleId} from ${discordId}: ${res.status}`);
  }
}


export async function assignTournamentWinnerRole(userId: string, tournamentWins: number): Promise<string | null> {
  if (!BOT_TOKEN || !GUILD_ID) {
    console.warn('[TournamentRoles] Missing BOT_DISCORD_TOKEN or SERVER_DISCORD_ID');
    return null;
  }

  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { accounts: { where: { provider: 'discord' } } },
  });

  if (!user || user.accounts.length === 0) {
    console.warn(`[TournamentRoles] User ${userId} has no Discord account linked`);
    return null;
  }

  const discordId = user.accounts[0].providerAccountId;

  
  const memberCheck = await isDiscordMember(discordId);
  if (!memberCheck) {
    console.warn(`[TournamentRoles] User ${userId} (Discord ${discordId}) is not a server member, skipping role assignment`);
    return null;
  }

  const newRoleName = getRoleName(tournamentWins);
  if (!newRoleName) return null; // wins 11-49: keep current role, no change

  const prevRoleName = getPreviousRoleName(tournamentWins);
  const prevLegacyName = prevRoleName ? getLegacyRoleName(tournamentWins === 50 ? 10 : tournamentWins - 1) : null;
  if (prevRoleName) {
    try {
      const prevRoleId = await findOrCreateRole(prevRoleName, prevLegacyName);
      await removeRole(discordId, prevRoleId);
    } catch (err) {
      console.warn(`[TournamentRoles] Failed to remove previous role:`, err);
    }
  }

  try {
    const newLegacyName = getLegacyRoleName(tournamentWins);
    const newRoleId = await findOrCreateRole(newRoleName, newLegacyName);
    await addRole(discordId, newRoleId);
    console.log(`[TournamentRoles] Assigned "${newRoleName}" to user ${userId} (Discord ${discordId})`);
    return newRoleName;
  } catch (err) {
    console.error(`[TournamentRoles] Failed to assign role:`, err);
    return null;
  }
}


export async function removeTournamentRole(userId: string): Promise<void> {
  if (!BOT_TOKEN || !GUILD_ID) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { accounts: { where: { provider: 'discord' } } },
  });
  if (!user || user.accounts.length === 0) return;

  const discordId = user.accounts[0].providerAccountId;

  
  const memberCheck = await isDiscordMember(discordId);
  if (!memberCheck) return;

  const currentWins = user.tournamentWins ?? 0;
  if (currentWins <= 0) return;

  const currentRoleName = getRoleName(currentWins);
  if (currentRoleName) {
    try {
      const roleId = await findOrCreateRole(currentRoleName, getLegacyRoleName(currentWins));
      await removeRole(discordId, roleId);
    } catch { /* ignore */ }
  }

  const newWins = Math.max(0, currentWins - 1);
  await prisma.user.update({ where: { id: userId }, data: { tournamentWins: newWins } });

  const newRoleName = getRoleName(newWins);
  if (newRoleName) {
    try {
      const newRoleId = await findOrCreateRole(newRoleName, getLegacyRoleName(newWins));
      await addRole(discordId, newRoleId);
    } catch { /* ignore */ }
  }
}


export async function isDiscordMember(discordId: string): Promise<boolean> {
  if (!BOT_TOKEN || !GUILD_ID) return false;
  try {
    const res = await discordFetch(`/guilds/${GUILD_ID}/members/${discordId}`);
    return res.ok;
  } catch {
    return false;
  }
}
