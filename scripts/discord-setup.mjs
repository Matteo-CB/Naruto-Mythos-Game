/**
 * Naruto Mythos TCG - Discord Server Setup Script
 *
 * Permission model:
 * - @everyone: NO access to any channel (ViewChannel denied at server level)
 * - Genin (minimum rank): sees all normal channels
 * - Chunin / Kage: same as Genin (higher ranks)
 * - Testeur: sees ONLY test channels (beta-testing, dev-internal, Test Voice)
 * - Developer / Hokage: sees everything (normal + test)
 * - Jonin (moderator): sees all normal channels
 *
 * If someone only has the Testeur role, they see ONLY test channels.
 * If they also have Genin, they see both normal and test channels.
 *
 * Usage:
 *   node scripts/discord-setup.mjs YOUR_BOT_TOKEN YOUR_GUILD_ID
 */

import { Client, GatewayIntentBits, PermissionsBitField, ChannelType, EmbedBuilder } from 'discord.js';

const BOT_TOKEN = process.argv[2];
const GUILD_ID = process.argv[3];

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('\n  Usage: node scripts/discord-setup.mjs <BOT_TOKEN> <GUILD_ID>\n');
  process.exit(1);
}

// ──────────────────────────────────────────────
// COLOR PALETTE (from the game's UI)
// ──────────────────────────────────────────────
const COLORS = {
  gold:       0xC4A35A,
  red:        0xB33E3E,
  green:      0x3E8B3E,
  purple:     0x6A6ABB,
  orange:     0xB37E3E,
  sand:       0xD4B896,
  dark:       0x141414,
  muted:      0x888888,
  white:      0xE0E0E0,
  sound:      0x5A5A8A,
  tester:     0x3EAAB3,
  champion:   0xFFD700,
  mod:        0x5865F2,
};

// ──────────────────────────────────────────────
// ROLES DEFINITION
// ──────────────────────────────────────────────
const ROLES = [
  // --- Staff ---
  {
    name: 'Hokage',
    color: COLORS.gold,
    hoist: true,
    position: 100,
    permissions: [PermissionsBitField.Flags.Administrator],
    mentionable: false,
  },
  {
    name: 'Jonin',
    color: COLORS.mod,
    hoist: true,
    position: 90,
    permissions: [
      PermissionsBitField.Flags.ManageMessages,
      PermissionsBitField.Flags.KickMembers,
      PermissionsBitField.Flags.BanMembers,
      PermissionsBitField.Flags.MuteMembers,
      PermissionsBitField.Flags.DeafenMembers,
      PermissionsBitField.Flags.MoveMembers,
      PermissionsBitField.Flags.ManageNicknames,
      PermissionsBitField.Flags.ManageThreads,
      PermissionsBitField.Flags.ModerateMembers,
    ],
    mentionable: false,
  },
  {
    name: 'Developer',
    color: COLORS.purple,
    hoist: true,
    position: 85,
    permissions: [],
    mentionable: true,
  },
  {
    name: 'Testeur',
    color: COLORS.tester,
    hoist: true,
    position: 80,
    permissions: [],
    mentionable: true,
  },

  // --- Rank / Prestige ---
  {
    name: 'Kage',
    color: COLORS.champion,
    hoist: true,
    position: 70,
    permissions: [],
    mentionable: false,
  },
  {
    name: 'Chunin',
    color: COLORS.orange,
    hoist: true,
    position: 60,
    permissions: [],
    mentionable: false,
  },
  {
    name: 'Genin',
    color: COLORS.green,
    hoist: true,
    position: 50,
    permissions: [],
    mentionable: false,
  },

  // --- Village affiliation (self-assignable) ---
  { name: 'Leaf Village', color: COLORS.green, hoist: false, position: 30, permissions: [], mentionable: false },
  { name: 'Sand Village', color: COLORS.sand, hoist: false, position: 29, permissions: [], mentionable: false },
  { name: 'Sound Village', color: COLORS.sound, hoist: false, position: 28, permissions: [], mentionable: false },
  { name: 'Akatsuki', color: COLORS.red, hoist: false, position: 27, permissions: [], mentionable: false },
  { name: 'Independent', color: COLORS.muted, hoist: false, position: 26, permissions: [], mentionable: false },

  // --- Language ---
  { name: 'English', color: null, hoist: false, position: 15, permissions: [], mentionable: false },
  { name: 'Francais', color: null, hoist: false, position: 14, permissions: [], mentionable: false },

  // --- Notifications ---
  { name: 'Updates', color: null, hoist: false, position: 10, permissions: [], mentionable: true },
  { name: 'Tournaments', color: null, hoist: false, position: 9, permissions: [], mentionable: true },
  { name: 'Events', color: null, hoist: false, position: 8, permissions: [], mentionable: true },
];

// ──────────────────────────────────────────────
// ACCESS LEVELS
// ──────────────────────────────────────────────
// 'normal'  = Genin, Chunin, Kage, Hokage, Jonin, Developer
// 'test'    = Testeur, Developer, Hokage ONLY
// 'staff'   = Developer, Hokage ONLY

const ACCESS_NORMAL = ['Genin', 'Chunin', 'Kage', 'Hokage', 'Jonin', 'Developer'];
const ACCESS_TEST   = ['Testeur', 'Developer', 'Hokage'];
const ACCESS_STAFF  = ['Developer', 'Hokage'];

// ──────────────────────────────────────────────
// CATEGORIES & CHANNELS DEFINITION
// ──────────────────────────────────────────────

const CATEGORIES = [
  // ═══════════════════════════════════════
  // WELCOME
  // ═══════════════════════════════════════
  {
    name: '\u2550\u2550  WELCOME  \u2550\u2550',
    access: 'normal',
    channels: [
      { name: 'rules', topic: 'Server rules \u2502 Read before participating \u2502 R\u00e8gles du serveur', readOnly: true },
      { name: 'announcements', topic: 'Official announcements & updates \u2502 Annonces officielles', readOnly: true },
      { name: 'pick-your-roles', topic: 'Choose your language, village, and notifications \u2502 Choisissez vos r\u00f4les' },
      { name: 'introductions', topic: 'Introduce yourself \u2502 Pr\u00e9sentez-vous' },
    ],
  },

  // ═══════════════════════════════════════
  // ENGLISH
  // ═══════════════════════════════════════
  {
    name: '\u2550\u2550  ENGLISH  \u2550\u2550',
    access: 'normal',
    channels: [
      { name: 'general-en', topic: 'General discussion about Naruto Mythos TCG' },
      { name: 'find-a-match', topic: 'Looking for an opponent? Post here with your ELO' },
      { name: 'deck-sharing-en', topic: 'Share your deck builds, get feedback, discuss meta' },
      { name: 'strategies-en', topic: 'Advanced strategies, mission control, chakra management, combos' },
      { name: 'card-discussion-en', topic: 'Discuss card effects, power levels, and synergies' },
      { name: 'help-en', topic: 'Need help with rules or game mechanics? Ask here' },
    ],
  },

  // ═══════════════════════════════════════
  // FRANCAIS
  // ═══════════════════════════════════════
  {
    name: '\u2550\u2550  FRAN\u00c7AIS  \u2550\u2550',
    access: 'normal',
    channels: [
      { name: 'general-fr', topic: 'Discussion g\u00e9n\u00e9rale sur Naruto Mythos TCG' },
      { name: 'chercher-un-match', topic: 'Vous cherchez un adversaire ? Postez ici avec votre ELO' },
      { name: 'partage-de-decks', topic: 'Partagez vos decks, demandez des conseils, discutez du m\u00e9ta' },
      { name: 'strategies-fr', topic: 'Strat\u00e9gies avanc\u00e9es, contr\u00f4le de mission, gestion du chakra, combos' },
      { name: 'discussion-cartes', topic: 'Discutez des effets des cartes, de leur puissance et synergies' },
      { name: 'aide-fr', topic: 'Besoin d\'aide avec les r\u00e8gles ou les m\u00e9caniques ? Demandez ici' },
    ],
  },

  // ═══════════════════════════════════════
  // COMPETITIVE
  // ═══════════════════════════════════════
  {
    name: '\u2550\u2550  COMPETITIVE  \u2550\u2550',
    access: 'normal',
    channels: [
      { name: 'leaderboard', topic: 'ELO rankings and top players \u2502 Classement ELO', readOnly: true },
      { name: 'tournaments', topic: 'Tournament announcements and sign-ups', readOnly: true },
      { name: 'tournament-chat', topic: 'Live tournament discussion' },
      { name: 'match-results', topic: 'Post your match results and screenshots' },
      { name: 'hall-of-fame', topic: 'Notable plays, epic comebacks, legendary moments', readOnly: true },
    ],
  },

  // ═══════════════════════════════════════
  // DEVELOPMENT (public part — Genin+)
  // ═══════════════════════════════════════
  {
    name: '\u2550\u2550  DEVELOPMENT  \u2550\u2550',
    access: 'normal',
    channels: [
      { name: 'changelog', topic: 'Game updates, patches, and new features \u2502 Mises \u00e0 jour', readOnly: true },
      { name: 'bug-reports', topic: 'Report bugs with screenshots and steps to reproduce' },
      { name: 'suggestions', topic: 'Feature requests and improvement ideas' },
    ],
  },

  // ═══════════════════════════════════════
  // TESTING (Testeur only — isolated)
  // ═══════════════════════════════════════
  {
    name: '\u2550\u2550  TESTING  \u2550\u2550',
    access: 'test',
    channels: [
      { name: 'beta-testing', topic: '[Testeur] Beta builds, test instructions, feedback' },
      { name: 'dev-internal', topic: '[Staff] Internal development discussion', access: 'staff' },
    ],
    voiceChannels: [
      { name: 'Test Voice' },
    ],
  },

  // ═══════════════════════════════════════
  // COMMUNITY
  // ═══════════════════════════════════════
  {
    name: '\u2550\u2550  COMMUNITY  \u2550\u2550',
    access: 'normal',
    channels: [
      { name: 'off-topic', topic: 'Talk about anything \u2502 Parlez de tout et de rien' },
      { name: 'fan-art', topic: 'Share your Naruto fan art \u2502 Partagez vos fan arts' },
      { name: 'memes', topic: 'Naruto TCG memes and funny moments' },
      { name: 'media-clips', topic: 'Game replays, screenshots, video content' },
    ],
  },

  // ═══════════════════════════════════════
  // VOICE (Genin+)
  // ═══════════════════════════════════════
  {
    name: '\u2550\u2550  VOICE  \u2550\u2550',
    access: 'normal',
    voiceChannels: [
      { name: 'Game Voice EN' },
      { name: 'Game Voice FR' },
      { name: 'Tournament Voice' },
      { name: 'Chill Zone' },
    ],
  },
];

// ──────────────────────────────────────────────
// PERMISSION HELPERS
// ──────────────────────────────────────────────

/**
 * Build permission overwrites for a category based on its access level.
 * @everyone is always denied ViewChannel.
 * The appropriate roles are granted ViewChannel + base permissions.
 */
function buildCategoryOverwrites(everyoneId, roleMap, accessLevel) {
  const overwrites = [
    // @everyone: can't see this category
    {
      id: everyoneId,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
  ];

  const accessRoles = accessLevel === 'test' ? ACCESS_TEST
                    : accessLevel === 'staff' ? ACCESS_STAFF
                    : ACCESS_NORMAL;

  for (const roleName of accessRoles) {
    const role = roleMap.get(roleName);
    if (role) {
      overwrites.push({
        id: role.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AddReactions,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.Speak,
        ],
      });
    }
  }

  return overwrites;
}

/**
 * Build channel-level overwrites for read-only channels.
 * Denies SendMessages for all roles that can view, except staff.
 */
function buildReadOnlyOverwrites(everyoneId, roleMap, parentAccess) {
  const overwrites = [
    // Deny SendMessages for @everyone (belt-and-suspenders)
    { id: everyoneId, deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
  ];

  const accessRoles = parentAccess === 'test' ? ACCESS_TEST
                    : parentAccess === 'staff' ? ACCESS_STAFF
                    : ACCESS_NORMAL;

  for (const roleName of accessRoles) {
    const role = roleMap.get(roleName);
    if (!role) continue;
    const isStaff = roleName === 'Hokage' || roleName === 'Developer';
    overwrites.push({
      id: role.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.ReadMessageHistory,
        ...(isStaff ? [PermissionsBitField.Flags.SendMessages] : []),
      ],
      deny: isStaff ? [] : [PermissionsBitField.Flags.SendMessages],
    });
  }

  return overwrites;
}

/**
 * Build channel-level overwrites for a channel with a more restrictive access
 * than its parent category (e.g., dev-internal inside TESTING category).
 */
function buildChannelAccessOverwrites(everyoneId, roleMap, channelAccess) {
  const overwrites = [
    { id: everyoneId, deny: [PermissionsBitField.Flags.ViewChannel] },
  ];

  const accessRoles = channelAccess === 'staff' ? ACCESS_STAFF
                    : channelAccess === 'test' ? ACCESS_TEST
                    : ACCESS_NORMAL;

  for (const roleName of accessRoles) {
    const role = roleMap.get(roleName);
    if (role) {
      overwrites.push({
        id: role.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.Speak,
        ],
      });
    }
  }

  // Deny ViewChannel for roles that had access to the parent but not this channel
  // E.g., Testeur can see the TESTING category but not dev-internal (staff only)
  const parentRoles = ACCESS_TEST; // TESTING category uses test access
  for (const roleName of parentRoles) {
    if (!accessRoles.includes(roleName)) {
      const role = roleMap.get(roleName);
      if (role) {
        overwrites.push({
          id: role.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        });
      }
    }
  }

  return overwrites;
}

// ──────────────────────────────────────────────
// WELCOME EMBEDS
// ──────────────────────────────────────────────

function buildRulesEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle('NARUTO MYTHOS TCG')
    .setDescription('Welcome to the official Naruto Mythos Trading Card Game community.\nBienvenue dans la communaut\u00e9 officielle du jeu Naruto Mythos TCG.')
    .addFields(
      {
        name: 'EN \u2502 Rules',
        value: [
          '**1.** Be respectful to all members',
          '**2.** No spam, flooding, or excessive caps',
          '**3.** No NSFW, hate speech, or harassment',
          '**4.** Use the appropriate channels for each topic',
          '**5.** No cheating, exploiting, or account sharing',
          '**6.** No advertising or self-promotion without permission',
          '**7.** Follow Discord ToS at all times',
          '**8.** Staff decisions are final',
        ].join('\n'),
      },
      {
        name: 'FR \u2502 R\u00e8gles',
        value: [
          '**1.** Soyez respectueux envers tous les membres',
          '**2.** Pas de spam, flood, ou majuscules excessives',
          '**3.** Pas de contenu NSFW, discours haineux, ou harc\u00e8lement',
          '**4.** Utilisez les salons appropri\u00e9s pour chaque sujet',
          '**5.** Pas de triche, d\'exploitation, ou de partage de compte',
          '**6.** Pas de publicit\u00e9 ou d\'auto-promotion sans permission',
          '**7.** Respectez les Conditions d\'Utilisation de Discord',
          '**8.** Les d\u00e9cisions du staff sont d\u00e9finitives',
        ].join('\n'),
      },
    )
    .setFooter({ text: 'Naruto Mythos TCG \u2502 naruto.daikicorp.fr' })
    .setTimestamp();
}

function buildRolesEmbed(roleMap) {
  const villageRoles = ['Leaf Village', 'Sand Village', 'Sound Village', 'Akatsuki', 'Independent'];
  const langRoles = ['English', 'Francais'];
  const notifRoles = ['Updates', 'Tournaments', 'Events'];

  const villageList = villageRoles.map(r => {
    const role = roleMap.get(r);
    return role ? `<@&${role.id}> \u2502 ${r}` : r;
  }).join('\n');

  const langList = langRoles.map(r => {
    const role = roleMap.get(r);
    return role ? `<@&${role.id}> \u2502 ${r === 'Francais' ? 'Fran\u00e7ais' : r}` : r;
  }).join('\n');

  const notifList = notifRoles.map(r => {
    const role = roleMap.get(r);
    return role ? `<@&${role.id}> \u2502 ${r}` : r;
  }).join('\n');

  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle('CHOOSE YOUR ROLES / CHOISISSEZ VOS ROLES')
    .setDescription('React to pick your roles below.\nR\u00e9agissez pour choisir vos r\u00f4les ci-dessous.')
    .addFields(
      { name: '\u2694 Village Affiliation', value: villageList },
      { name: '\u{1F4AC} Language / Langue', value: langList },
      { name: '\u{1F514} Notifications', value: notifList },
    )
    .addFields(
      {
        name: '\u{1F3C6} Rank Roles (Automatic)',
        value: [
          '**Kage** \u2502 ELO 2000+',
          '**Chunin** \u2502 ELO 1200-1999',
          '**Genin** \u2502 ELO < 1200',
          '',
          'The **Genin** role is required to access all channels.',
          'Rank roles are assigned automatically from your in-game ELO.',
        ].join('\n'),
      },
    )
    .setFooter({ text: 'New members receive Genin automatically when they create an account' })
    .setTimestamp();
}

function buildWelcomeEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle('WELCOME TO NARUTO MYTHOS TCG')
    .setDescription([
      'Naruto Mythos is a digital trading card game where you play as a Kage',
      'sending ninja on missions to earn victory points.',
      '',
      '**Game Features:**',
      '\u2502 4-turn strategic gameplay with 66 unique cards',
      '\u2502 5 factions: Leaf, Sand, Sound, Akatsuki, Independent',
      '\u2502 7 rarities: Common, Uncommon, Rare, Rare Art, Secret, Mythos, Legendary',
      '\u2502 4 effect types: MAIN, UPGRADE, AMBUSH, SCORE',
      '\u2502 4 AI difficulties: Easy, Medium, Hard, Expert',
      '\u2502 Online matchmaking with ELO rankings',
      '\u2502 Deck builder with 30+ card decks and 3 mission cards',
      '\u2502 Full English and French support',
      '',
      '**Play now:** https://naruto.daikicorp.fr',
    ].join('\n'))
    .setFooter({ text: 'Naruto Mythos TCG' })
    .setTimestamp();
}

function buildLeaderboardEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.champion)
    .setTitle('ELO LEADERBOARD')
    .setDescription([
      'Rankings are updated from in-game data.',
      '',
      '**ELO System:**',
      '\u2502 Starting ELO: 1000',
      '\u2502 K-Factor: 32 (below 2000) / 16 (2000+)',
      '\u2502 Win: +ELO / Loss: -ELO / Draw: minimal change',
      '\u2502 Minimum ELO floor: 100',
      '',
      '**Ranks:**',
      '\u2502 Genin \u2502 Below 1200 ELO',
      '\u2502 Chunin \u2502 1200 - 1999 ELO',
      '\u2502 Kage \u2502 2000+ ELO',
      '',
      'Full leaderboard: https://naruto.daikicorp.fr/leaderboard',
    ].join('\n'))
    .setFooter({ text: 'Only rated online matches affect ELO' })
    .setTimestamp();
}

function buildChangelogEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.purple)
    .setTitle('CHANGELOG')
    .setDescription([
      'All game updates and patches will be posted here.',
      'Toutes les mises \u00e0 jour du jeu seront publi\u00e9es ici.',
      '',
      '**Current Version: 0.1.0**',
      '',
      'Features:',
      '\u2502 66 playable cards with full effect implementation',
      '\u2502 4 AI difficulty levels',
      '\u2502 Online multiplayer with rooms and matchmaking',
      '\u2502 Deck builder with validation',
      '\u2502 ELO ranking system',
      '\u2502 Friends system with match invitations',
      '\u2502 Learn mode with interactive quiz',
      '\u2502 Full EN/FR localization',
    ].join('\n'))
    .setFooter({ text: 'Naruto Mythos TCG \u2502 Development' })
    .setTimestamp();
}

function buildBetaTestingEmbed() {
  return new EmbedBuilder()
    .setColor(COLORS.tester)
    .setTitle('BETA TESTING CHANNEL')
    .setDescription([
      'This channel is restricted to members with the **Testeur** role.',
      'Ce salon est r\u00e9serv\u00e9 aux membres ayant le r\u00f4le **Testeur**.',
      '',
      '**What to test / Quoi tester:**',
      '\u2502 New card effects and interactions',
      '\u2502 Online multiplayer stability',
      '\u2502 UI/UX issues on different devices',
      '\u2502 AI difficulty balance',
      '\u2502 Deck builder functionality',
      '',
      '**How to report / Comment rapporter:**',
      '\u2502 Describe the bug clearly',
      '\u2502 Steps to reproduce',
      '\u2502 Expected vs actual behavior',
      '\u2502 Screenshots or screen recordings',
      '\u2502 Browser and device information',
    ].join('\n'))
    .setFooter({ text: 'Thank you for helping improve the game!' })
    .setTimestamp();
}

// ──────────────────────────────────────────────
// MAIN SETUP FUNCTION
// ──────────────────────────────────────────────

async function setupServer() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ],
  });

  // Wait for the client to be fully ready before doing anything
  const readyPromise = new Promise(resolve => client.once('ready', resolve));
  await client.login(BOT_TOKEN);
  await readyPromise;
  console.log(`\n  Logged in as ${client.user.tag}\n`);

  // Fetch the guild with full data
  let guild = await client.guilds.fetch(GUILD_ID);
  // Re-fetch to ensure all properties (name, memberCount) are populated
  guild = await guild.fetch();
  // Fetch all roles into cache so guild.roles.everyone is available
  await guild.roles.fetch();

  console.log(`  Server: ${guild.name} (${guild.memberCount} members)\n`);

  const everyoneRole = guild.roles.everyone;
  if (!everyoneRole) {
    // Fallback: the @everyone role ID is always the guild ID
    console.log('  WARNING: guild.roles.everyone not found, using guild.id as fallback');
  }
  const everyoneId = everyoneRole?.id || guild.id;

  // ──────────────────────────────────────────
  // Step 1: Delete existing channels
  // ──────────────────────────────────────────
  console.log('  [1/6] Cleaning existing channels...');
  const existingChannels = await guild.channels.fetch();
  for (const [, channel] of existingChannels) {
    if (channel && channel.deletable) {
      try {
        await channel.delete('Server setup script');
      } catch (e) {
        console.log(`    Could not delete: ${channel.name}`);
      }
    }
  }
  console.log('    Done.\n');

  // ──────────────────────────────────────────
  // Step 2: Create roles
  // ──────────────────────────────────────────
  console.log('  [2/6] Creating roles...');
  const roleMap = new Map();

  for (const roleDef of ROLES) {
    try {
      const role = await guild.roles.create({
        name: roleDef.name,
        color: roleDef.color ?? undefined,
        hoist: roleDef.hoist,
        permissions: roleDef.permissions.length > 0
          ? roleDef.permissions
          : [],
        mentionable: roleDef.mentionable,
        reason: 'Server setup script',
      });
      roleMap.set(roleDef.name, role);
      console.log(`    + ${roleDef.name} (${role.id})`);
    } catch (e) {
      console.error(`    ERROR creating role ${roleDef.name}:`, e.message);
    }
  }
  console.log(`    ${roleMap.size} roles created.\n`);

  // ──────────────────────────────────────────
  // Step 3: Set @everyone defaults — NO ViewChannel
  // ──────────────────────────────────────────
  console.log('  [3/6] Configuring @everyone (no channel access)...');
  try {
    // Fetch the @everyone role object directly if we don't have it
    const everyoneRoleObj = everyoneRole || await guild.roles.fetch(guild.id);
    await everyoneRoleObj.setPermissions([
      // Basic perms only — ViewChannel is NOT included
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.ReadMessageHistory,
      PermissionsBitField.Flags.AddReactions,
      PermissionsBitField.Flags.UseExternalEmojis,
      PermissionsBitField.Flags.AttachFiles,
      PermissionsBitField.Flags.EmbedLinks,
      PermissionsBitField.Flags.Connect,
      PermissionsBitField.Flags.Speak,
      PermissionsBitField.Flags.UseVAD,
    ]);
    console.log('    @everyone: ViewChannel DENIED (role required to see any channel).\n');
  } catch (e) {
    console.error('    ERROR setting @everyone permissions:', e.message, '\n');
  }

  // ──────────────────────────────────────────
  // Step 4: Create categories and channels
  // ──────────────────────────────────────────
  console.log('  [4/6] Creating categories and channels...');

  const channelMap = new Map();

  for (const cat of CATEGORIES) {
    try {
      const catAccess = cat.access || 'normal';

      // Build category-level permission overwrites
      const catOverwrites = buildCategoryOverwrites(everyoneId, roleMap, catAccess);

      const category = await guild.channels.create({
        name: cat.name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: catOverwrites,
        reason: 'Server setup script',
      });
      console.log(`    [Category] ${cat.name} (access: ${catAccess})`);

      // Create text channels
      if (cat.channels) {
        for (const ch of cat.channels) {
          let permissionOverwrites;

          if (ch.readOnly) {
            // Read-only: deny SendMessages for non-staff, inherit parent visibility
            permissionOverwrites = buildReadOnlyOverwrites(everyoneId, roleMap, catAccess);
          } else if (ch.access && ch.access !== catAccess) {
            // Channel has more restrictive access than its parent category
            permissionOverwrites = buildChannelAccessOverwrites(everyoneId, roleMap, ch.access);
          }

          const channel = await guild.channels.create({
            name: ch.name,
            type: ChannelType.GuildText,
            parent: category.id,
            topic: ch.topic || undefined,
            permissionOverwrites: permissionOverwrites || undefined,
            reason: 'Server setup script',
          });

          channelMap.set(ch.name, channel);
          const suffix = ch.readOnly ? ' [read-only]' : (ch.access ? ` [${ch.access} only]` : '');
          console.log(`    # ${ch.name}${suffix}`);
        }
      }

      // Create voice channels
      if (cat.voiceChannels) {
        for (const vc of cat.voiceChannels) {
          const channel = await guild.channels.create({
            name: vc.name,
            type: ChannelType.GuildVoice,
            parent: category.id,
            reason: 'Server setup script',
          });

          channelMap.set(vc.name, channel);
          console.log(`    \u266A ${vc.name}`);
        }
      }
    } catch (e) {
      console.error(`    ERROR creating category ${cat.name}:`, e.message);
    }
  }
  console.log(`    ${channelMap.size} channels created.\n`);

  // ──────────────────────────────────────────
  // Step 5: Post welcome embeds
  // ──────────────────────────────────────────
  console.log('  [5/6] Posting welcome embeds...');

  const embedTargets = [
    { channel: 'rules', embed: buildRulesEmbed() },
    { channel: 'pick-your-roles', embed: buildRolesEmbed(roleMap) },
    { channel: 'introductions', embed: buildWelcomeEmbed() },
    { channel: 'leaderboard', embed: buildLeaderboardEmbed() },
    { channel: 'changelog', embed: buildChangelogEmbed() },
    { channel: 'beta-testing', embed: buildBetaTestingEmbed() },
  ];

  for (const { channel: chName, embed } of embedTargets) {
    const ch = channelMap.get(chName);
    if (ch && ch.isTextBased()) {
      try {
        await ch.send({ embeds: [embed] });
        console.log(`    Posted embed in #${chName}`);
      } catch (e) {
        console.error(`    ERROR posting in #${chName}:`, e.message);
      }
    }
  }
  console.log('');

  // ──────────────────────────────────────────
  // Step 6: Final configuration
  // ──────────────────────────────────────────
  console.log('  [6/6] Final configuration...');

  try {
    await guild.setDefaultMessageNotifications(1); // Only @mentions
    console.log('    Default notifications: mentions only');
  } catch (e) {
    console.error('    ERROR setting notifications:', e.message);
  }

  // ──────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────
  console.log('\n  ============================================');
  console.log('  Server setup complete!');
  console.log('  ============================================\n');
  console.log(`  Roles created:    ${roleMap.size}`);
  console.log(`  Channels created: ${channelMap.size}`);
  console.log('');
  console.log('  Permission model:');
  console.log('    @everyone        -> NO access (can\'t see any channel)');
  console.log('    Genin (minimum)  -> Normal channels (Welcome, EN, FR, Competitive, Dev, Community, Voice)');
  console.log('    Chunin / Kage    -> Same as Genin');
  console.log('    Testeur          -> ONLY test channels (beta-testing, dev-internal, Test Voice)');
  console.log('    Developer        -> All channels (normal + test)');
  console.log('    Hokage           -> All channels (admin)');
  console.log('    Jonin            -> Normal channels + moderation');
  console.log('');
  console.log('  Role IDs for reference:');
  for (const [name, role] of roleMap) {
    console.log(`    ${name.padEnd(20)} ${role.id}`);
  }
  console.log('\n  Next steps:');
  console.log('    1. Assign Genin to all current members (or set up auto-role on join)');
  console.log('    2. Set up reaction roles in #pick-your-roles (Carl-bot)');
  console.log('    3. Set the server icon');
  console.log('    4. Configure AutoMod if desired');
  console.log('    5. Remove the setup bot if no longer needed\n');

  await client.destroy();
  process.exit(0);
}

setupServer().catch((err) => {
  console.error('\n  FATAL ERROR:', err.message);
  process.exit(1);
});
