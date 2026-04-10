/**
 * Sync all Discord roles for all linked users.
 * Removes stale roles and assigns the correct one based on current ELO.
 *
 * Usage: npx tsx scripts/sync-all-discord-roles.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Manual .env parsing (no dotenv dependency)
const envPath = resolve(__dirname, '..', '.env');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* .env not found */ }

const DISCORD_API = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.BOT_DISCORD_TOKEN;
const GUILD_ID = process.env.SERVER_DISCORD_ID;
const DATABASE_URL = process.env.DATABASE_URL;

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('Missing BOT_DISCORD_TOKEN or SERVER_DISCORD_ID');
  process.exit(1);
}

// ELO roles definition (must match roles.ts)
const UNRANKED_ROLE_NAME = '\u257C Unranked \u257E';
const ELO_ROLES = [
  { name: '\u257C Academy Student \u257E', minElo: 0 },
  { name: '\u257C Genin \u257E', minElo: 450 },
  { name: '\u257C Chunin \u257E', minElo: 550 },
  { name: '\u257C Special Jonin \u257E', minElo: 700 },
  { name: '\u257C Elite Jonin \u257E', minElo: 1000 },
  { name: '\u257C Legendary Sannin \u257E', minElo: 1200 },
  { name: '\u257C Kage \u257E', minElo: 1700 },
  { name: '\u257C Sage of Six Paths \u257E', minElo: 2000 },
];
const PLACEMENT_MATCHES = 5;
const ALL_ROLE_NAMES = [UNRANKED_ROLE_NAME, ...ELO_ROLES.map(r => r.name)];

function getRoleForElo(elo: number) {
  let matched = ELO_ROLES[0];
  for (const role of ELO_ROLES) {
    if (elo >= role.minElo) matched = role;
  }
  return matched;
}

async function discordFetch(path: string, options?: RequestInit) {
  return fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
}

async function main() {
  // 1. Fetch guild roles
  const rolesRes = await discordFetch(`/guilds/${GUILD_ID}/roles`);
  if (!rolesRes.ok) {
    console.error('Failed to fetch guild roles:', rolesRes.status);
    process.exit(1);
  }
  const guildRoles = await rolesRes.json() as Array<{ id: string; name: string }>;
  const roleMap = new Map<string, string>();
  for (const r of guildRoles) {
    if (ALL_ROLE_NAMES.includes(r.name)) {
      roleMap.set(r.name, r.id);
    }
  }
  console.log(`Found ${roleMap.size}/${ALL_ROLE_NAMES.length} ELO roles in guild`);
  for (const [name, id] of roleMap) {
    console.log(`  ${name} => ${id}`);
  }

  // 2. Fetch all users with discordId from DB via Prisma
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  const users = await prisma.user.findMany({
    where: { discordId: { not: null } },
    select: { id: true, username: true, elo: true, discordId: true, wins: true, losses: true, draws: true },
  });
  console.log(`\nFound ${users.length} users with linked Discord accounts\n`);

  let fixed = 0;
  let errors = 0;
  let skipped = 0;

  for (const user of users) {
    if (!user.discordId) continue;

    const totalGames = (user.wins ?? 0) + (user.losses ?? 0) + (user.draws ?? 0);
    const isPlaced = totalGames >= PLACEMENT_MATCHES;
    const targetRole = isPlaced ? getRoleForElo(user.elo) : { name: UNRANKED_ROLE_NAME };
    const targetRoleId = roleMap.get(targetRole.name);

    if (!targetRoleId) {
      console.log(`[SKIP] ${user.username}: target role "${targetRole.name}" not found in guild`);
      skipped++;
      continue;
    }

    // Fetch member
    const memberRes = await discordFetch(`/guilds/${GUILD_ID}/members/${user.discordId}`);
    if (!memberRes.ok) {
      if (memberRes.status === 404) {
        skipped++;
        continue; // Not in guild
      }
      console.log(`[ERROR] ${user.username}: failed to fetch member (${memberRes.status})`);
      errors++;
      continue;
    }
    const member = await memberRes.json() as { roles: string[] };

    // Check current ELO roles
    const currentEloRoles = member.roles.filter(id => [...roleMap.values()].includes(id));
    const currentRoleNames = currentEloRoles.map(id => {
      for (const [name, rid] of roleMap) {
        if (rid === id) return name;
      }
      return '?';
    });

    const hasCorrectRole = member.roles.includes(targetRoleId);
    const hasExtraRoles = currentEloRoles.filter(id => id !== targetRoleId).length > 0;

    if (hasCorrectRole && !hasExtraRoles) {
      continue; // Already correct
    }

    console.log(`[FIX] ${user.username} (ELO: ${user.elo}, games: ${totalGames})`);
    console.log(`  Current roles: [${currentRoleNames.join(', ')}]`);
    console.log(`  Target: ${targetRole.name}`);

    // Remove wrong roles
    for (const roleId of currentEloRoles) {
      if (roleId !== targetRoleId) {
        const roleName = [...roleMap.entries()].find(([, id]) => id === roleId)?.[0] ?? '?';
        await discordFetch(`/guilds/${GUILD_ID}/members/${user.discordId}/roles/${roleId}`, { method: 'DELETE' });
        console.log(`  - Removed: ${roleName}`);
        // Rate limit safety
        await new Promise(r => setTimeout(r, 300));
      }
    }

    // Add correct role
    if (!hasCorrectRole) {
      await discordFetch(`/guilds/${GUILD_ID}/members/${user.discordId}/roles/${targetRoleId}`, { method: 'PUT' });
      console.log(`  + Added: ${targetRole.name}`);
      await new Promise(r => setTimeout(r, 300));
    }

    fixed++;
  }

  await prisma.$disconnect();
  console.log(`\nDone. Fixed: ${fixed}, Skipped: ${skipped}, Errors: ${errors}`);
}

main().catch(console.error);
