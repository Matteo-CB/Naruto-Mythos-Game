/**
 * Fix Discord roles for existing users.
 *
 * - Users with < 5 games (unranked) should have the "Unranked" role, not a league role.
 * - Users with >= 5 games (placed) should have the correct league role for their ELO.
 * - Removes all incorrect ELO roles and assigns the correct one.
 *
 * Usage: npx tsx scripts/fix-discord-roles.ts
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

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('Missing BOT_DISCORD_TOKEN or SERVER_DISCORD_ID in .env');
  process.exit(1);
}

const PLACEMENT_MATCHES = 5;

// Role definitions (must match lib/discord/roles.ts)
const UNRANKED_ROLE_NAME = '\u257C Unranked \u257E';
const ELO_ROLE_NAMES = [
  { name: '\u257C Academy Student \u257E', minElo: 0 },
  { name: '\u257C Genin \u257E', minElo: 450 },
  { name: '\u257C Chunin \u257E', minElo: 550 },
  { name: '\u257C Special Jonin \u257E', minElo: 800 },
  { name: '\u257C Elite Jonin \u257E', minElo: 1000 },
  { name: '\u257C Legendary Sannin \u257E', minElo: 1200 },
  { name: '\u257C Kage \u257E', minElo: 1600 },
  { name: '\u257C Sage of Six Paths \u257E', minElo: 2000 },
];

const ALL_MANAGED_ROLE_NAMES = [UNRANKED_ROLE_NAME, ...ELO_ROLE_NAMES.map(r => r.name)];

function getRoleForElo(elo: number) {
  let matched = ELO_ROLE_NAMES[0];
  for (const role of ELO_ROLE_NAMES) {
    if (elo >= role.minElo) matched = role;
  }
  return matched;
}

async function discordFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
  return res;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Discord Role Fix Script ===\n');

  // 1. Get guild roles
  const rolesRes = await discordFetch(`/guilds/${GUILD_ID}/roles`);
  if (!rolesRes.ok) {
    console.error('Failed to fetch guild roles:', rolesRes.status);
    process.exit(1);
  }
  const guildRoles = await rolesRes.json() as { id: string; name: string }[];

  // Build map of managed role names -> IDs
  const roleMap = new Map<string, string>();
  for (const role of guildRoles) {
    if (ALL_MANAGED_ROLE_NAMES.includes(role.name)) {
      roleMap.set(role.name, role.id);
    }
  }

  console.log('Found managed roles on server:');
  for (const [name, id] of roleMap) {
    console.log(`  ${name} -> ${id}`);
  }

  // 2. Create Unranked role if it doesn't exist
  if (!roleMap.has(UNRANKED_ROLE_NAME)) {
    console.log(`\nCreating "${UNRANKED_ROLE_NAME}" role...`);
    const createRes = await discordFetch(`/guilds/${GUILD_ID}/roles`, {
      method: 'POST',
      body: JSON.stringify({ name: UNRANKED_ROLE_NAME, color: 0x555555, hoist: true, mentionable: false }),
    });
    if (createRes.ok) {
      const created = await createRes.json() as { id: string; name: string };
      roleMap.set(UNRANKED_ROLE_NAME, created.id);
      console.log(`  Created with ID ${created.id}`);
    } else {
      console.error('  Failed to create:', createRes.status, await createRes.text());
    }
    await sleep(500);
  }

  // 3. Connect to DB and get all users with discordId
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const users = await prisma.user.findMany({
      where: { discordId: { not: null } },
      select: { id: true, username: true, elo: true, wins: true, losses: true, draws: true, discordId: true },
    });

    console.log(`\nFound ${users.length} users with linked Discord accounts.\n`);

    let fixed = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of users) {
      const totalGames = (user.wins ?? 0) + (user.losses ?? 0) + (user.draws ?? 0);
      const isPlaced = totalGames >= PLACEMENT_MATCHES;
      const targetRoleName = isPlaced ? getRoleForElo(user.elo).name : UNRANKED_ROLE_NAME;
      const targetRoleId = roleMap.get(targetRoleName);

      if (!targetRoleId) {
        console.log(`  [SKIP] ${user.username}: Target role "${targetRoleName}" not found on server`);
        skipped++;
        continue;
      }

      // Fetch member
      const memberRes = await discordFetch(`/guilds/${GUILD_ID}/members/${user.discordId}`);
      if (!memberRes.ok) {
        if (memberRes.status === 404) {
          console.log(`  [SKIP] ${user.username}: Not in Discord server`);
          skipped++;
        } else {
          console.log(`  [ERROR] ${user.username}: Failed to fetch member (${memberRes.status})`);
          errors++;
        }
        await sleep(300);
        continue;
      }
      const member = await memberRes.json() as { roles: string[] };

      // Check current state
      const hasTargetRole = member.roles.includes(targetRoleId);
      const wrongRoles = Array.from(roleMap.entries())
        .filter(([name, id]) => name !== targetRoleName && member.roles.includes(id))
        .map(([name]) => name);

      if (hasTargetRole && wrongRoles.length === 0) {
        console.log(`  [OK] ${user.username} (${user.elo} ELO, ${totalGames} games) -> ${targetRoleName}`);
        skipped++;
        await sleep(200);
        continue;
      }

      // Fix: remove wrong roles
      for (const wrongName of wrongRoles) {
        const wrongId = roleMap.get(wrongName);
        if (wrongId) {
          await discordFetch(`/guilds/${GUILD_ID}/members/${user.discordId}/roles/${wrongId}`, { method: 'DELETE' });
          console.log(`  [FIX] ${user.username}: Removed "${wrongName}"`);
          await sleep(300);
        }
      }

      // Fix: add correct role
      if (!hasTargetRole) {
        await discordFetch(`/guilds/${GUILD_ID}/members/${user.discordId}/roles/${targetRoleId}`, { method: 'PUT' });
        console.log(`  [FIX] ${user.username} (${user.elo} ELO, ${totalGames} games) -> Added "${targetRoleName}"`);
        await sleep(300);
      }

      fixed++;
    }

    console.log(`\n=== Summary ===`);
    console.log(`  Total users: ${users.length}`);
    console.log(`  Fixed: ${fixed}`);
    console.log(`  Already correct / skipped: ${skipped}`);
    console.log(`  Errors: ${errors}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
