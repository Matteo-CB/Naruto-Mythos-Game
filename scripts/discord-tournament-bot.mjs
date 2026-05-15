// Naruto Mythos TCG - Tournament reaction bot
// Listens for trophy-emoji reactions on the configured signup message and
// toggles the Tournament role on the reacting user.
//
// Designed to run as a long-living systemd service on the VPS (siblings the
// main app service). Reconnect is handled by discord.js automatically.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

try {
  const raw = readFileSync(resolve(root, '.env'), 'utf-8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["'](.*)["']$/, '$1');
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* .env not found, rely on existing env */ }

const BOT_TOKEN = process.env.BOT_DISCORD_TOKEN;
const GUILD_ID = process.env.SERVER_DISCORD_ID;
const ROLE_ID = process.env.TOURNAMENT_ROLE_ID;
const MESSAGE_ID = process.env.TOURNAMENT_ROLE_MESSAGE_ID;

const TROPHY = '\u{1F3C6}';

function fatal(msg) {
  console.error(`[TournamentBot] FATAL: ${msg}`);
  process.exit(1);
}

if (!BOT_TOKEN) fatal('BOT_DISCORD_TOKEN missing from .env');
if (!GUILD_ID) fatal('SERVER_DISCORD_ID missing from .env');
if (!ROLE_ID) fatal('TOURNAMENT_ROLE_ID missing from .env (run Phase B setup first)');
if (!MESSAGE_ID) fatal('TOURNAMENT_ROLE_MESSAGE_ID missing from .env (run Phase B setup first)');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User],
});

function isTrophyOnTargetMessage(reaction) {
  if (!reaction || !reaction.message) return false;
  if (reaction.message.id !== MESSAGE_ID) return false;
  const name = reaction.emoji?.name;
  return name === TROPHY;
}

async function assignRole(userId) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId);
    if (member.roles.cache.has(ROLE_ID)) {
      console.log(`[TournamentBot] User ${userId} already has the Tournament role, skipping`);
      return;
    }
    await member.roles.add(ROLE_ID, 'Reacted with trophy on the signup message');
    console.log(`[TournamentBot] Added Tournament role to ${member.user?.tag ?? userId}`);
  } catch (err) {
    console.error(`[TournamentBot] Failed to add role to ${userId}:`, err?.message ?? err);
  }
}

async function removeRole(userId) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId);
    if (!member.roles.cache.has(ROLE_ID)) {
      console.log(`[TournamentBot] User ${userId} did not have the Tournament role, skipping`);
      return;
    }
    await member.roles.remove(ROLE_ID, 'Removed trophy reaction on the signup message');
    console.log(`[TournamentBot] Removed Tournament role from ${member.user?.tag ?? userId}`);
  } catch (err) {
    console.error(`[TournamentBot] Failed to remove role from ${userId}:`, err?.message ?? err);
  }
}

client.once(Events.ClientReady, (c) => {
  console.log(`[TournamentBot] Connected as ${c.user.tag}`);
  console.log(`[TournamentBot] Watching message ${MESSAGE_ID} in guild ${GUILD_ID}`);
  console.log(`[TournamentBot] Will toggle role ${ROLE_ID} on trophy reactions`);
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }
    if (!isTrophyOnTargetMessage(reaction)) return;
    await assignRole(user.id);
  } catch (err) {
    console.error('[TournamentBot] MessageReactionAdd handler error:', err?.message ?? err);
  }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }
    if (!isTrophyOnTargetMessage(reaction)) return;
    await removeRole(user.id);
  } catch (err) {
    console.error('[TournamentBot] MessageReactionRemove handler error:', err?.message ?? err);
  }
});

client.on(Events.Error, (err) => {
  console.error('[TournamentBot] Client error:', err?.message ?? err);
});

client.on(Events.ShardDisconnect, (event, shardId) => {
  console.warn(`[TournamentBot] Shard ${shardId} disconnected: code=${event.code}`);
});

client.on(Events.ShardReconnecting, (shardId) => {
  console.log(`[TournamentBot] Shard ${shardId} reconnecting...`);
});

client.on(Events.ShardResume, (shardId, replayed) => {
  console.log(`[TournamentBot] Shard ${shardId} resumed (replayed ${replayed} events)`);
});

process.on('SIGTERM', () => {
  console.log('[TournamentBot] SIGTERM received, shutting down');
  client.destroy();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[TournamentBot] SIGINT received, shutting down');
  client.destroy();
  process.exit(0);
});

console.log('[TournamentBot] Starting...');
client.login(BOT_TOKEN).catch((err) => {
  fatal(`Login failed: ${err?.message ?? err}`);
});
