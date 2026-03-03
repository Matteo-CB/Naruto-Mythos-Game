/**
 * Naruto Mythos TCG - Discord Rank-Up Notification Bot
 *
 * Creates a #rank-ups channel and posts notifications when players change rank.
 * Polls the game's leaderboard API at regular intervals to detect ELO changes.
 *
 * Usage:
 *   node scripts/discord-rankup-bot.mjs [BOT_TOKEN] [GUILD_ID] [API_BASE_URL]
 *
 * Or set environment variables:
 *   BOT_DISCORD_TOKEN, SERVER_DISCORD_ID, GAME_API_URL
 *
 * Example:
 *   node scripts/discord-rankup-bot.mjs "your-bot-token" "your-guild-id" "https://naruto.daikicorp.fr"
 */

import { readFileSync } from 'fs';

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
const API_BASE = (process.argv[4] || process.env.GAME_API_URL || 'https://naruto.daikicorp.fr').replace(/\/$/, '');

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('\n  Naruto Mythos TCG - Rank-Up Bot');
  console.error('  ================================\n');
  console.error('  Usage: node scripts/discord-rankup-bot.mjs [BOT_TOKEN] [GUILD_ID] [API_BASE_URL]\n');
  console.error('  Or set BOT_DISCORD_TOKEN, SERVER_DISCORD_ID, GAME_API_URL in .env\n');
  process.exit(1);
}

const API = 'https://discord.com/api/v10';
const POLL_INTERVAL = 60_000; // Check every 60 seconds
const CHANNEL_NAME = 'rank-ups';

// ──────────────────────────────────────────────
// ELO RANK DEFINITIONS (must match discord-elo-roles.mjs)
// ──────────────────────────────────────────────
const RANKS = [
  { name: 'Academy Student', role: '╼ Academy Student ╾', color: 0x888888, minElo: 0,    icon: '/images/icons/scroll-kunai.webp' },
  { name: 'Genin',           role: '╼ Genin ╾',           color: 0x3E8B3E, minElo: 450,  icon: '/images/icons/kunai.webp' },
  { name: 'Chunin',          role: '╼ Chunin ╾',          color: 0xB37E3E, minElo: 550,  icon: '/images/icons/shuriken.webp' },
  { name: 'Special Jonin',   role: '╼ Special Jonin ╾',   color: 0x5A7ABB, minElo: 650,  icon: '/images/icons/kunai.webp' },
  { name: 'Elite Jonin',     role: '╼ Elite Jonin ╾',     color: 0x5865F2, minElo: 750,  icon: '/images/icons/shuriken.webp' },
  { name: 'Legendary Sannin',role: '╼ Legendary Sannin ╾',color: 0x9B59B6, minElo: 900,  icon: '/images/icons/scroll-kunai.webp' },
  { name: 'Kage',            role: '╼ Kage ╾',            color: 0xC4A35A, minElo: 1050, icon: '/images/icons/uzumaki-spiral.webp' },
  { name: 'Sage of Six Paths',role:'╼ Sage of Six Paths ╾',color: 0xFFD700, minElo: 1200, icon: '/images/icons/uzumaki-spiral.webp' },
];

// Rank-up messages (themed)
const RANK_UP_TITLES = {
  'Academy Student': 'A NEW NINJA ENROLLS',
  'Genin':           'GENIN PROMOTION',
  'Chunin':          'CHUNIN EXAM PASSED',
  'Special Jonin':   'SPECIAL JONIN APPOINTMENT',
  'Elite Jonin':     'ELITE JONIN ASCENSION',
  'Legendary Sannin':'A NEW SANNIN EMERGES',
  'Kage':            'THE KAGE RISES',
  'Sage of Six Paths':'SAGE OF SIX PATHS AWAKENED',
};

const RANK_UP_DESCRIPTIONS = {
  'Academy Student': 'has begun their journey at the Academy.',
  'Genin':           'has earned the rank of Genin! The missions await.',
  'Chunin':          'has proven their tactical prowess and ascended to Chunin!',
  'Special Jonin':   'has been recognized as a Special Jonin for their expertise!',
  'Elite Jonin':     'has reached the Elite Jonin rank! A formidable ninja.',
  'Legendary Sannin':'has attained the legendary status of Sannin! Fear and respect follow.',
  'Kage':            'has risen to Kage! The village bows to their strength.',
  'Sage of Six Paths':'has transcended all limits and awakened the power of the Sage of Six Paths!',
};

const RANK_DOWN_TITLES = {
  'Academy Student': 'BACK TO THE ACADEMY',
  'Genin':           'RETURNED TO GENIN',
  'Chunin':          'DEMOTED TO CHUNIN',
  'Special Jonin':   'BACK TO SPECIAL JONIN',
  'Elite Jonin':     'RETURNED TO ELITE JONIN',
  'Legendary Sannin':'SANNIN RANK MAINTAINED',
  'Kage':            'RETURNED TO KAGE',
  'Sage of Six Paths':'STILL A SAGE',
};

// ──────────────────────────────────────────────
// DISCORD API HELPERS
// ──────────────────────────────────────────────

async function discordFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (res.status === 429) {
    const data = await res.json();
    const retryAfter = (data.retry_after || 1) * 1000;
    console.log(`  [Rate limited] Waiting ${retryAfter}ms...`);
    await new Promise((r) => setTimeout(r, retryAfter));
    return discordFetch(path, options);
  }

  return res;
}

// ──────────────────────────────────────────────
// RANK HELPERS
// ──────────────────────────────────────────────

function getRank(elo) {
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (elo >= r.minElo) rank = r;
  }
  return rank;
}

function getRankIndex(elo) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (elo >= RANKS[i].minElo) idx = i;
  }
  return idx;
}

function buildProgressBar(elo, rank, nextRank) {
  const barLength = 16;
  if (!nextRank) {
    // Max rank — full bar
    return '▓'.repeat(barLength) + ' MAX';
  }
  const range = nextRank.minElo - rank.minElo;
  const progress = elo - rank.minElo;
  const filled = Math.min(barLength, Math.max(0, Math.round((progress / range) * barLength)));
  const empty = barLength - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty) + ` ${elo}/${nextRank.minElo}`;
}

// ──────────────────────────────────────────────
// NOTIFICATION EMBEDS
// ──────────────────────────────────────────────

function buildRankUpEmbed(username, oldRank, newRank, elo, wins, losses) {
  const isPromotion = getRankIndex(newRank.minElo) > getRankIndex(oldRank.minElo);
  const nextRank = RANKS[getRankIndex(elo) + 1] || null;
  const progressBar = buildProgressBar(elo, newRank, nextRank);

  const title = isPromotion
    ? RANK_UP_TITLES[newRank.name] || 'RANK CHANGE'
    : RANK_DOWN_TITLES[newRank.name] || 'RANK CHANGE';

  const description = isPromotion
    ? `**${username}** ${RANK_UP_DESCRIPTIONS[newRank.name]}`
    : `**${username}** has returned to the rank of **${newRank.name}**.`;

  const fields = [
    {
      name: isPromotion ? 'Rank Up' : 'Rank Change',
      value: `${oldRank.name}  -->  **${newRank.name}**`,
      inline: true,
    },
    {
      name: 'Current ELO',
      value: `**${elo}**`,
      inline: true,
    },
    {
      name: 'Record',
      value: `${wins}W / ${losses}L`,
      inline: true,
    },
    {
      name: 'Progress',
      value: `\`${progressBar}\``,
      inline: false,
    },
  ];

  // Add next milestone for promotions
  if (isPromotion && nextRank) {
    fields.push({
      name: 'Next Rank',
      value: `**${nextRank.name}** at ${nextRank.minElo} ELO (${nextRank.minElo - elo} to go)`,
      inline: false,
    });
  }

  return {
    embeds: [{
      title,
      description,
      color: newRank.color,
      fields,
      footer: {
        text: `Naruto Mythos TCG | ${isPromotion ? 'Promotion' : 'Rank Change'}`,
      },
      timestamp: new Date().toISOString(),
    }],
  };
}

// ──────────────────────────────────────────────
// CHANNEL SETUP
// ──────────────────────────────────────────────

async function findOrCreateChannel() {
  // Check if channel already exists
  const channelsRes = await discordFetch(`/guilds/${GUILD_ID}/channels`);
  if (!channelsRes.ok) {
    console.error('  Failed to fetch channels:', channelsRes.status);
    process.exit(1);
  }

  const channels = await channelsRes.json();
  const existing = channels.find((ch) => ch.name === CHANNEL_NAME && ch.type === 0);

  if (existing) {
    console.log(`  Found existing #${CHANNEL_NAME} channel (${existing.id})`);
    return existing.id;
  }

  // Find the COMPETITIVE category to place the channel in
  const competitiveCategory = channels.find(
    (ch) => ch.type === 4 && ch.name.includes('COMPETITIVE'),
  );

  // Create the channel
  const createBody = {
    name: CHANNEL_NAME,
    type: 0, // GUILD_TEXT
    topic: 'Automatic rank-up notifications | Notifications automatiques de changement de rang',
  };

  if (competitiveCategory) {
    createBody.parent_id = competitiveCategory.id;
  }

  const createRes = await discordFetch(`/guilds/${GUILD_ID}/channels`, {
    method: 'POST',
    body: JSON.stringify(createBody),
  });

  if (!createRes.ok) {
    console.error('  Failed to create channel:', createRes.status, await createRes.text());
    process.exit(1);
  }

  const newChannel = await createRes.json();
  console.log(`  Created #${CHANNEL_NAME} channel (${newChannel.id})`);

  // Post welcome message
  await discordFetch(`/channels/${newChannel.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      embeds: [{
        title: 'RANK-UP NOTIFICATIONS',
        description: [
          'This channel posts automatic notifications when players change rank.',
          'Ce salon publie des notifications quand les joueurs changent de rang.',
          '',
          '**Rank Tiers:**',
          ...RANKS.map((r) => `\u2502 **${r.name}** \u2014 ${r.minElo}+ ELO`),
          '',
          'Climb the ranks by winning rated matches!',
          'Grimpez les rangs en gagnant des matchs class\u00e9s !',
        ].join('\n'),
        color: 0xC4A35A,
        footer: { text: 'Naruto Mythos TCG | Rank System' },
        timestamp: new Date().toISOString(),
      }],
    }),
  });

  return newChannel.id;
}

// ──────────────────────────────────────────────
// LEADERBOARD POLLING
// ──────────────────────────────────────────────

// In-memory cache of player ELOs to detect rank changes
const playerCache = new Map(); // username -> { elo, rank, wins, losses }

async function fetchLeaderboard() {
  try {
    const res = await fetch(`${API_BASE}/api/leaderboard?limit=500`);
    if (!res.ok) {
      console.error(`  [Poll] Leaderboard API returned ${res.status}`);
      return null;
    }
    const data = await res.json();
    return data.players || data;
  } catch (err) {
    console.error(`  [Poll] Failed to fetch leaderboard: ${err.message}`);
    return null;
  }
}

async function checkForRankChanges(channelId) {
  const players = await fetchLeaderboard();
  if (!players || !Array.isArray(players)) return;

  const notifications = [];

  for (const player of players) {
    const username = player.username;
    const elo = player.elo || 1000;
    const wins = player.wins || 0;
    const losses = player.losses || 0;
    const currentRank = getRank(elo);

    const cached = playerCache.get(username);

    if (cached) {
      const oldRank = cached.rank;
      const oldRankIndex = getRankIndex(oldRank.minElo);
      const newRankIndex = getRankIndex(elo);

      // Rank changed!
      if (oldRankIndex !== newRankIndex) {
        const isPromotion = newRankIndex > oldRankIndex;
        notifications.push({
          username,
          oldRank,
          newRank: currentRank,
          elo,
          wins,
          losses,
          isPromotion,
        });

        console.log(
          `  [Rank ${isPromotion ? 'UP' : 'DOWN'}] ${username}: ` +
          `${oldRank.name} (${cached.elo}) -> ${currentRank.name} (${elo})`
        );
      }
    }

    // Update cache
    playerCache.set(username, { elo, rank: currentRank, wins, losses });
  }

  // Post notifications (promotions first, then demotions)
  notifications.sort((a, b) => {
    if (a.isPromotion !== b.isPromotion) return a.isPromotion ? -1 : 1;
    return getRankIndex(b.newRank.minElo) - getRankIndex(a.newRank.minElo);
  });

  for (const notif of notifications) {
    const embed = buildRankUpEmbed(
      notif.username,
      notif.oldRank,
      notif.newRank,
      notif.elo,
      notif.wins,
      notif.losses,
    );

    const msgRes = await discordFetch(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify(embed),
    });

    if (!msgRes.ok) {
      console.error(`  [Notify] Failed to post for ${notif.username}:`, msgRes.status);
    } else {
      console.log(`  [Notify] Posted rank change for ${notif.username}`);
    }

    // Small delay between messages to avoid rate limits
    await new Promise((r) => setTimeout(r, 500));
  }
}

// ──────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────

async function main() {
  console.log('\n  Naruto Mythos TCG - Rank-Up Bot');
  console.log('  ================================\n');
  console.log(`  Bot Token: ${BOT_TOKEN.slice(0, 8)}...`);
  console.log(`  Guild ID:  ${GUILD_ID}`);
  console.log(`  API Base:  ${API_BASE}`);
  console.log(`  Poll Interval: ${POLL_INTERVAL / 1000}s\n`);

  // Step 1: Create or find the rank-ups channel
  console.log('  [Setup] Finding or creating #rank-ups channel...');
  const channelId = await findOrCreateChannel();
  console.log(`  [Setup] Channel ID: ${channelId}\n`);

  // Step 2: Initial leaderboard load (populate cache, no notifications)
  console.log('  [Setup] Loading initial leaderboard data...');
  const initialPlayers = await fetchLeaderboard();
  if (initialPlayers && Array.isArray(initialPlayers)) {
    for (const player of initialPlayers) {
      const elo = player.elo || 1000;
      playerCache.set(player.username, {
        elo,
        rank: getRank(elo),
        wins: player.wins || 0,
        losses: player.losses || 0,
      });
    }
    console.log(`  [Setup] Cached ${playerCache.size} players.\n`);
  } else {
    console.log('  [Setup] No players found (API may be unreachable).\n');
  }

  // Step 3: Start polling loop
  console.log('  [Running] Polling for rank changes...\n');

  const poll = async () => {
    try {
      await checkForRankChanges(channelId);
    } catch (err) {
      console.error(`  [Error] ${err.message}`);
    }
  };

  // Poll immediately, then at intervals
  setInterval(poll, POLL_INTERVAL);

  // Keep the process alive
  console.log('  Bot is running. Press Ctrl+C to stop.\n');
}

main().catch((err) => {
  console.error('\n  FATAL ERROR:', err.message);
  process.exit(1);
});
