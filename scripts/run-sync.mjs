import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const DISCORD_API = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.BOT_DISCORD_TOKEN;
const GUILD_ID = process.env.SERVER_DISCORD_ID;

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('Missing BOT_DISCORD_TOKEN or SERVER_DISCORD_ID in .env');
  process.exit(1);
}

const PLACEMENT_MATCHES_REQUIRED = 5;

const UNRANKED_ROLE = { key: 'unranked', label: 'Unranked', minElo: -1 };
const ELO_ROLES = [
  { key: 'academy_student', label: 'Academy Student', minElo: 0 },
  { key: 'genin', label: 'Genin', minElo: 450 },
  { key: 'chunin', label: 'Chunin', minElo: 550 },
  { key: 'special_jonin', label: 'Special Jonin', minElo: 800 },
  { key: 'elite_jonin', label: 'Elite Jonin', minElo: 1000 },
  { key: 'legendary_sannin', label: 'Legendary Sannin', minElo: 1200 },
  { key: 'kage', label: 'Kage', minElo: 1600 },
  { key: 'sage', label: 'Sage of Six Paths', minElo: 2000 },
];
const ALL_ROLES = [UNRANKED_ROLE, ...ELO_ROLES];

function getRoleForElo(elo) {
  let matched = ELO_ROLES[0];
  for (const role of ELO_ROLES) {
    if (elo >= role.minElo) matched = role;
  }
  return matched;
}

async function discordFetch(path, options, retries = 2) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });
  if (res.status === 429 && retries > 0) {
    const body = await res.json().catch(() => ({}));
    const retryAfter = (body.retry_after ?? 1) * 1000;
    console.warn(`  Rate limited, retrying after ${retryAfter}ms...`);
    await new Promise(r => setTimeout(r, retryAfter + 100));
    return discordFetch(path, options, retries - 1);
  }
  return res;
}

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const prisma = new PrismaClient();

  // Load stored Discord role IDs from SiteSettings
  const settings = await prisma.siteSettings.findUnique({
    where: { key: 'global' },
  });

  const roleIdMap = settings?.discordRoleIds ?? {};

  if (!roleIdMap || Object.keys(roleIdMap).length === 0) {
    console.error('No discordRoleIds configured in SiteSettings.');
    console.error('Run the admin Discord role setup first (POST /api/admin/discord-roles)');
    console.error('Or manually set them with PUT /api/admin/discord-roles');
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('Stored role ID mapping:');
  for (const role of ALL_ROLES) {
    const id = roleIdMap[role.key];
    console.log(`  ${role.key} (${role.label}): ${id || 'NOT SET'}`);
  }

  // Collect all stored ELO role IDs
  const allRoleIds = new Set();
  for (const role of ALL_ROLES) {
    const id = roleIdMap[role.key];
    if (id) allRoleIds.add(id);
  }

  // Fetch all users with Discord linked
  const users = await prisma.user.findMany({
    where: { discordId: { not: null } },
    select: { id: true, username: true, elo: true, discordId: true, wins: true, losses: true, draws: true },
  });

  console.log(`\nSyncing ${users.length} users...\n`);

  let synced = 0;
  let errors = 0;

  for (const user of users) {
    const totalGames = (user.wins ?? 0) + (user.losses ?? 0) + (user.draws ?? 0);
    const isPlaced = totalGames >= PLACEMENT_MATCHES_REQUIRED;
    const targetRole = isPlaced ? getRoleForElo(user.elo) : UNRANKED_ROLE;
    const targetRoleId = roleIdMap[targetRole.key];

    if (!targetRoleId) {
      console.error(`  [${user.username}] No Discord role ID for key "${targetRole.key}"!`);
      errors++;
      continue;
    }

    // Fetch member
    const memberRes = await discordFetch(`/guilds/${GUILD_ID}/members/${user.discordId}`);
    if (!memberRes.ok) {
      if (memberRes.status === 404) {
        console.log(`  [${user.username}] Not in guild, skipping`);
      } else {
        console.error(`  [${user.username}] Failed to fetch member: ${memberRes.status}`);
        errors++;
      }
      continue;
    }
    const member = await memberRes.json();

    // Find current ELO roles to report
    const currentEloRoles = [];
    for (const role of ALL_ROLES) {
      const id = roleIdMap[role.key];
      if (id && member.roles.includes(id)) {
        currentEloRoles.push(role.label);
      }
    }

    // Find roles to remove
    const rolesToRemove = [];
    for (const role of ALL_ROLES) {
      const id = roleIdMap[role.key];
      if (id && id !== targetRoleId && member.roles.includes(id)) {
        rolesToRemove.push({ key: role.key, label: role.label, id });
      }
    }
    const needsTarget = !member.roles.includes(targetRoleId);

    if (rolesToRemove.length === 0 && !needsTarget) {
      console.log(`  [${user.username}] ELO=${user.elo} games=${totalGames} -> "${targetRole.label}" (already correct)`);
      synced++;
      continue;
    }

    console.log(`  [${user.username}] ELO=${user.elo} games=${totalGames} | current: [${currentEloRoles.join(', ')}] -> target: "${targetRole.label}"`);

    // Remove old roles
    for (const r of rolesToRemove) {
      const res = await discordFetch(`/guilds/${GUILD_ID}/members/${user.discordId}/roles/${r.id}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        console.log(`    - Removed "${r.label}"`);
      } else {
        console.error(`    - FAILED to remove "${r.label}" (${res.status})`);
      }
      await delay(250);
    }

    // Add target role
    if (needsTarget) {
      const res = await discordFetch(`/guilds/${GUILD_ID}/members/${user.discordId}/roles/${targetRoleId}`, { method: 'PUT' });
      if (res.ok || res.status === 204) {
        console.log(`    + Added "${targetRole.label}"`);
      } else {
        console.error(`    + FAILED to add "${targetRole.label}" (${res.status})`);
      }
    }

    synced++;
    await delay(500);
  }

  console.log(`\nDone! Total: ${users.length}, Synced: ${synced}, Errors: ${errors}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
