/**
 * Discord ELO Roles Setup Script
 *
 * Replaces old Genin/Chunin/Kage rank roles with the new 8-tier ELO system.
 * Migrates channel permissions so new roles inherit access from old ones.
 *
 * Usage:
 *   node scripts/discord-elo-roles.mjs [BOT_TOKEN] [GUILD_ID]
 *
 * If no arguments provided, reads from environment variables:
 *   BOT_DISCORD_TOKEN, SERVER_DISCORD_ID
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually (no dotenv dependency needed)
try {
  const envFile = readFileSync(new URL('../.env', import.meta.url), 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* .env not found — rely on CLI args or existing env */ }

const BOT_TOKEN = process.argv[2] || process.env.BOT_DISCORD_TOKEN;
const GUILD_ID = process.argv[3] || process.env.SERVER_DISCORD_ID;

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('\n  Usage: node scripts/discord-elo-roles.mjs [BOT_TOKEN] [GUILD_ID]');
  console.error('  Or set BOT_DISCORD_TOKEN and SERVER_DISCORD_ID in .env\n');
  process.exit(1);
}

const API = 'https://discord.com/api/v10';

async function discordFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  // Handle rate limiting
  if (res.status === 429) {
    const data = await res.json();
    const retryAfter = (data.retry_after || 1) * 1000;
    console.log(`    Rate limited, waiting ${retryAfter}ms...`);
    await new Promise((r) => setTimeout(r, retryAfter));
    return discordFetch(path, options);
  }

  return res;
}

// Old rank roles to delete (already cleaned up — kept empty for safety)
const OLD_ROLE_NAMES = [];

// New ELO roles (ordered from lowest to highest tier)
// iconFile: league WebP images used as role icons (requires Guild Boost Level 2)
const ELO_ROLES = [
  { name: '\u257C Academy Student \u257E', color: 0x888888, minElo: 0,    iconFile: 'academy-student.webp' },
  { name: '\u257C Genin \u257E',           color: 0x3E8B3E, minElo: 450,  iconFile: 'genin.webp' },
  { name: '\u257C Chunin \u257E',          color: 0xB37E3E, minElo: 550,  iconFile: 'chunin.webp' },
  { name: '\u257C Special Jonin \u257E',   color: 0x5A7ABB, minElo: 650,  iconFile: 'special-jonin.webp' },
  { name: '\u257C Elite Jonin \u257E',     color: 0x5865F2, minElo: 750,  iconFile: 'elite-jonin.webp' },
  { name: '\u257C Legendary Sannin \u257E', color: 0x9B59B6, minElo: 900,  iconFile: 'legendary-sannin.webp' },
  { name: '\u257C Kage \u257E',            color: 0xC4A35A, minElo: 1050, iconFile: 'kage.webp' },
  { name: '\u257C Sage of Six Paths \u257E', color: 0xFFD700, minElo: 1200, iconFile: 'sage-of-six-paths.webp' },
];

/**
 * Load a league icon as base64 data URI for Discord role icon.
 * Discord accepts role icons as base64-encoded image data URIs.
 */
function loadIconAsBase64(filename) {
  try {
    const filePath = resolve(__dirname, '..', 'public', 'images', 'leagues', filename);
    const buffer = readFileSync(filePath);
    return `data:image/webp;base64,${buffer.toString('base64')}`;
  } catch (err) {
    console.warn(`    Warning: Could not load icon ${filename}: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('\n  Naruto Mythos TCG - ELO Roles Setup');
  console.log('  ====================================\n');

  // Step 1: Fetch existing guild roles
  console.log('  [1/5] Fetching existing roles...');
  const rolesRes = await discordFetch(`/guilds/${GUILD_ID}/roles`);
  if (!rolesRes.ok) {
    console.error('    Failed to fetch roles:', rolesRes.status, await rolesRes.text());
    process.exit(1);
  }
  const existingRoles = await rolesRes.json();
  console.log(`    Found ${existingRoles.length} roles.`);

  // Step 2: Find old rank roles and collect their IDs
  console.log('\n  [2/5] Identifying old rank roles...');
  const oldRoleIds = [];
  for (const roleName of OLD_ROLE_NAMES) {
    const role = existingRoles.find((r) => r.name === roleName);
    if (role) {
      oldRoleIds.push(role.id);
      console.log(`    Found "${roleName}" (${role.id})`);
    } else {
      console.log(`    "${roleName}" not found (skipping)`);
    }
  }

  // Check for existing ELO roles (to update in-place instead of delete/recreate)
  const existingEloRoleNames = ELO_ROLES.map((r) => r.name);
  const existingEloRoles = existingRoles.filter((r) => existingEloRoleNames.includes(r.name));
  const existingEloMap = new Map(existingEloRoles.map((r) => [r.name, r]));
  if (existingEloRoles.length > 0) {
    console.log(`\n    Found ${existingEloRoles.length} existing ELO roles — will update in-place (members keep their roles).`);
  }

  // Step 3: Create or update ELO roles
  console.log('\n  [3/5] Creating/updating ELO roles...');
  const newRoleIds = [];

  for (const roleDef of ELO_ROLES) {
    // Load league icon as base64
    const iconData = roleDef.iconFile ? loadIconAsBase64(roleDef.iconFile) : null;

    const roleBody = {
      name: roleDef.name,
      color: roleDef.color,
      hoist: true,
      mentionable: false,
    };

    // Add icon if loaded (requires Guild Boost Level 2 / ROLE_ICONS feature)
    if (iconData) {
      roleBody.icon = iconData;
    }

    // Check if this role already exists — PATCH to update instead of recreating
    const existingRole = existingEloMap.get(roleDef.name);

    if (existingRole) {
      // Update existing role via PATCH (preserves member assignments)
      const res = await discordFetch(`/guilds/${GUILD_ID}/roles/${existingRole.id}`, {
        method: 'PATCH',
        body: JSON.stringify(roleBody),
      });

      if (!res.ok) {
        const errText = await res.text();
        // If icon failed due to missing boosts, retry without icon
        if (iconData && (errText.includes('ROLE_ICONS') || errText.includes('50101') || errText.includes('more boosts'))) {
          console.log(`    Note: Guild needs more boosts for role icons. Updating "${roleDef.name}" without icon...`);
          delete roleBody.icon;
          const retryRes = await discordFetch(`/guilds/${GUILD_ID}/roles/${existingRole.id}`, {
            method: 'PATCH',
            body: JSON.stringify(roleBody),
          });
          if (!retryRes.ok) {
            console.error(`    ERROR updating "${roleDef.name}":`, await retryRes.text());
          } else {
            newRoleIds.push({ name: roleDef.name, id: existingRole.id });
            console.log(`    ~ ${roleDef.name} (${existingRole.id}) [updated, no icon]`);
          }
          continue;
        }
        console.error(`    ERROR updating "${roleDef.name}":`, errText);
        continue;
      }

      newRoleIds.push({ name: roleDef.name, id: existingRole.id });
      console.log(`    ~ ${roleDef.name} (${existingRole.id}) [updated${iconData ? ', with icon' : ''}]`);
      continue;
    }

    // Role doesn't exist yet — create it
    roleBody.permissions = '0';
    const res = await discordFetch(`/guilds/${GUILD_ID}/roles`, {
      method: 'POST',
      body: JSON.stringify(roleBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      // If icon failed due to missing ROLE_ICONS feature or insufficient boosts, retry without icon
      if (iconData && (errText.includes('ROLE_ICONS') || errText.includes('50101') || errText.includes('more boosts'))) {
        console.log(`    Note: Guild needs more boosts for role icons. Creating "${roleDef.name}" without icon...`);
        delete roleBody.icon;
        const retryRes = await discordFetch(`/guilds/${GUILD_ID}/roles`, {
          method: 'POST',
          body: JSON.stringify(roleBody),
        });
        if (!retryRes.ok) {
          console.error(`    ERROR creating "${roleDef.name}":`, await retryRes.text());
          continue;
        }
        const role = await retryRes.json();
        newRoleIds.push({ name: roleDef.name, id: role.id });
        console.log(`    + ${roleDef.name} (${role.id}) [created, no icon]`);
        continue;
      }
      console.error(`    ERROR creating "${roleDef.name}":`, errText);
      continue;
    }

    const role = await res.json();
    newRoleIds.push({ name: roleDef.name, id: role.id });
    console.log(`    + ${roleDef.name} (${role.id}) [created${iconData ? ', with icon' : ''}]`);
  }

  // Step 4: Migrate channel permissions
  console.log('\n  [4/5] Migrating channel permissions...');

  // Fetch all channels
  const channelsRes = await discordFetch(`/guilds/${GUILD_ID}/channels`);
  if (!channelsRes.ok) {
    console.error('    Failed to fetch channels:', channelsRes.status);
  } else {
    const channels = await channelsRes.json();
    let migratedCount = 0;

    for (const channel of channels) {
      const overwrites = channel.permission_overwrites || [];

      // Check if this channel has overwrites for any old role
      const hasOldOverwrite = overwrites.some((ow) => oldRoleIds.includes(ow.id));
      if (!hasOldOverwrite) continue;

      // Find the most permissive old overwrite to use as template
      let templateOverwrite = null;
      for (const ow of overwrites) {
        if (oldRoleIds.includes(ow.id)) {
          if (!templateOverwrite || BigInt(ow.allow) > BigInt(templateOverwrite.allow)) {
            templateOverwrite = ow;
          }
        }
      }

      if (!templateOverwrite) continue;

      // Add overwrites for all new ELO roles using the template
      for (const newRole of newRoleIds) {
        // Skip if this channel already has an overwrite for this role
        const exists = overwrites.some((ow) => ow.id === newRole.id);
        if (exists) continue;

        const res = await discordFetch(
          `/channels/${channel.id}/permissions/${newRole.id}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              id: newRole.id,
              type: 0, // role type
              allow: templateOverwrite.allow,
              deny: templateOverwrite.deny,
            }),
          },
        );

        if (!res.ok && res.status !== 204) {
          console.error(`    ERROR setting perms on #${channel.name} for ${newRole.name}:`, res.status);
        }
      }

      migratedCount++;
      console.log(`    Migrated #${channel.name}`);
    }

    console.log(`    ${migratedCount} channels migrated.`);
  }

  // Step 5: Delete old roles
  console.log('\n  [5/5] Deleting old rank roles...');
  for (const roleId of oldRoleIds) {
    const role = existingRoles.find((r) => r.id === roleId);
    const roleName = role?.name || roleId;

    const res = await discordFetch(`/guilds/${GUILD_ID}/roles/${roleId}`, {
      method: 'DELETE',
    });

    if (res.ok || res.status === 204) {
      console.log(`    - Deleted "${roleName}"`);
    } else if (res.status === 404) {
      console.log(`    - "${roleName}" already deleted`);
    } else {
      console.error(`    ERROR deleting "${roleName}":`, res.status);
    }
  }

  // Summary
  console.log('\n  ====================================');
  console.log('  ELO Roles Setup Complete!');
  console.log('  ====================================\n');
  console.log('  New ELO Roles:');
  for (const role of newRoleIds) {
    const def = ELO_ROLES.find((r) => r.name === role.name);
    console.log(`    ${role.name.padEnd(32)} ${role.id}  (${def?.minElo}+ ELO)`);
  }
  console.log('\n  Old roles deleted:', oldRoleIds.length);
  console.log('');
}

main().catch((err) => {
  console.error('\n  FATAL ERROR:', err.message);
  process.exit(1);
});
