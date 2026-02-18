/**
 * Naruto Mythos TCG - Discord Server Setup Script
 *
 * This script configures an entire Discord server with:
 * - Roles with permissions and colors
 * - Categories and channels (bilingual EN/FR)
 * - Channel topics and descriptions
 * - Permission overwrites per role
 * - Welcome embeds in key channels
 *
 * Usage:
 *   1. Create a Discord bot at https://discord.com/developers/applications
 *   2. Copy the bot token
 *   3. Invite bot to your server with Administrator permission
 *   4. Run: node scripts/discord-setup.mjs YOUR_BOT_TOKEN YOUR_GUILD_ID
 *
 * To get your Guild ID: Enable Developer Mode in Discord settings,
 * right-click your server name -> Copy Server ID
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
  gold:       0xC4A35A,  // Primary accent
  red:        0xB33E3E,  // Danger / Akatsuki
  green:      0x3E8B3E,  // Success / Leaf
  purple:     0x6A6ABB,  // Mythos / Secret
  orange:     0xB37E3E,  // B-rank
  sand:       0xD4B896,  // Sand Village
  dark:       0x141414,  // Surface
  muted:      0x888888,  // Muted text
  white:      0xE0E0E0,  // Foreground
  sound:      0x5A5A8A,  // Sound Village
  tester:     0x3EAAB3,  // Tester role
  champion:   0xFFD700,  // Champion
  mod:        0x5865F2,  // Moderator (Discord blurple)
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
    description: 'ELO 2000+',
  },
  {
    name: 'Chunin',
    color: COLORS.orange,
    hoist: true,
    position: 60,
    permissions: [],
    mentionable: false,
    description: 'ELO 1200-1999',
  },
  {
    name: 'Genin',
    color: COLORS.green,
    hoist: true,
    position: 50,
    permissions: [],
    mentionable: false,
    description: 'ELO < 1200',
  },

  // --- Village affiliation (self-assignable) ---
  {
    name: 'Leaf Village',
    color: COLORS.green,
    hoist: false,
    position: 30,
    permissions: [],
    mentionable: false,
  },
  {
    name: 'Sand Village',
    color: COLORS.sand,
    hoist: false,
    position: 29,
    permissions: [],
    mentionable: false,
  },
  {
    name: 'Sound Village',
    color: COLORS.sound,
    hoist: false,
    position: 28,
    permissions: [],
    mentionable: false,
  },
  {
    name: 'Akatsuki',
    color: COLORS.red,
    hoist: false,
    position: 27,
    permissions: [],
    mentionable: false,
  },
  {
    name: 'Independent',
    color: COLORS.muted,
    hoist: false,
    position: 26,
    permissions: [],
    mentionable: false,
  },

  // --- Language ---
  {
    name: 'English',
    color: null,
    hoist: false,
    position: 15,
    permissions: [],
    mentionable: false,
  },
  {
    name: 'Francais',
    color: null,
    hoist: false,
    position: 14,
    permissions: [],
    mentionable: false,
  },

  // --- Notifications ---
  {
    name: 'Updates',
    color: null,
    hoist: false,
    position: 10,
    permissions: [],
    mentionable: true,
  },
  {
    name: 'Tournaments',
    color: null,
    hoist: false,
    position: 9,
    permissions: [],
    mentionable: true,
  },
  {
    name: 'Events',
    color: null,
    hoist: false,
    position: 8,
    permissions: [],
    mentionable: true,
  },
];

// ──────────────────────────────────────────────
// CHANNELS DEFINITION
// ──────────────────────────────────────────────

// Helper to deny @everyone from seeing a channel
const PRIVATE = (everyoneId) => [
  { id: everyoneId, deny: [PermissionsBitField.Flags.ViewChannel] },
];

// Helper for read-only announcement channels
const READ_ONLY = (everyoneId) => [
  { id: everyoneId, deny: [PermissionsBitField.Flags.SendMessages] },
];

const CATEGORIES = [
  // ════════════════════════════════════════════
  // WELCOME
  // ════════════════════════════════════════════
  {
    name: '\u2550\u2550  WELCOME  \u2550\u2550',
    channels: [
      {
        name: 'rules',
        topic: 'Server rules \u2502 Read before participating \u2502 R\u00e8gles du serveur',
        readOnly: true,
      },
      {
        name: 'announcements',
        topic: 'Official announcements & updates \u2502 Annonces officielles et mises \u00e0 jour',
        readOnly: true,
      },
      {
        name: 'pick-your-roles',
        topic: 'Choose your language, village, and notification preferences \u2502 Choisissez votre langue et village',
      },
      {
        name: 'introductions',
        topic: 'Introduce yourself to the community \u2502 Pr\u00e9sentez-vous \u00e0 la communaut\u00e9',
      },
    ],
  },

  // ════════════════════════════════════════════
  // ENGLISH
  // ════════════════════════════════════════════
  {
    name: '\u2550\u2550  ENGLISH  \u2550\u2550',
    channels: [
      {
        name: 'general-en',
        topic: 'General discussion about Naruto Mythos TCG',
      },
      {
        name: 'find-a-match',
        topic: 'Looking for an opponent? Post here with your ELO and preferred format',
      },
      {
        name: 'deck-sharing-en',
        topic: 'Share your deck builds, get feedback, discuss meta strategies',
      },
      {
        name: 'strategies-en',
        topic: 'Advanced strategies, mission control, chakra management, card combos',
      },
      {
        name: 'card-discussion-en',
        topic: 'Discuss individual card effects, power levels, and synergies',
      },
      {
        name: 'help-en',
        topic: 'Need help with rules or game mechanics? Ask here',
      },
    ],
  },

  // ════════════════════════════════════════════
  // FRANCAIS
  // ════════════════════════════════════════════
  {
    name: '\u2550\u2550  FRAN\u00c7AIS  \u2550\u2550',
    channels: [
      {
        name: 'general-fr',
        topic: 'Discussion g\u00e9n\u00e9rale sur Naruto Mythos TCG',
      },
      {
        name: 'chercher-un-match',
        topic: 'Vous cherchez un adversaire ? Postez ici avec votre ELO',
      },
      {
        name: 'partage-de-decks',
        topic: 'Partagez vos decks, demandez des conseils, discutez du m\u00e9ta',
      },
      {
        name: 'strategies-fr',
        topic: 'Strat\u00e9gies avanc\u00e9es, contr\u00f4le de mission, gestion du chakra, combos',
      },
      {
        name: 'discussion-cartes',
        topic: 'Discutez des effets des cartes, de leur puissance et de leurs synergies',
      },
      {
        name: 'aide-fr',
        topic: 'Besoin d\'aide avec les r\u00e8gles ou les m\u00e9caniques ? Demandez ici',
      },
    ],
  },

  // ════════════════════════════════════════════
  // COMPETITIVE
  // ════════════════════════════════════════════
  {
    name: '\u2550\u2550  COMPETITIVE  \u2550\u2550',
    channels: [
      {
        name: 'leaderboard',
        topic: 'ELO rankings and top players \u2502 Classement ELO',
        readOnly: true,
      },
      {
        name: 'tournaments',
        topic: 'Tournament announcements and sign-ups \u2502 Annonces et inscriptions de tournois',
        readOnly: true,
      },
      {
        name: 'tournament-chat',
        topic: 'Live tournament discussion \u2502 Discussion en direct des tournois',
      },
      {
        name: 'match-results',
        topic: 'Post your match results and screenshots \u2502 Publiez vos r\u00e9sultats',
      },
      {
        name: 'hall-of-fame',
        topic: 'Notable plays, epic comebacks, and legendary moments \u2502 Moments l\u00e9gendaires',
        readOnly: true,
      },
    ],
  },

  // ════════════════════════════════════════════
  // DEVELOPMENT
  // ════════════════════════════════════════════
  {
    name: '\u2550\u2550  DEVELOPMENT  \u2550\u2550',
    channels: [
      {
        name: 'changelog',
        topic: 'Game updates, patches, and new features \u2502 Mises \u00e0 jour du jeu',
        readOnly: true,
      },
      {
        name: 'bug-reports',
        topic: 'Report bugs here with screenshots and steps to reproduce \u2502 Signaler des bugs',
      },
      {
        name: 'suggestions',
        topic: 'Feature requests and improvement ideas \u2502 Id\u00e9es et suggestions',
      },
      {
        name: 'beta-testing',
        topic: '[Testeur only] Beta builds, test instructions, feedback \u2502 Tests en cours',
        restrictTo: 'Testeur',
      },
      {
        name: 'dev-internal',
        topic: '[Developer only] Internal development discussion',
        restrictTo: 'Developer',
      },
    ],
  },

  // ════════════════════════════════════════════
  // COMMUNITY
  // ════════════════════════════════════════════
  {
    name: '\u2550\u2550  COMMUNITY  \u2550\u2550',
    channels: [
      {
        name: 'off-topic',
        topic: 'Talk about anything \u2502 Parlez de tout et de rien',
      },
      {
        name: 'fan-art',
        topic: 'Share your Naruto and card game fan art \u2502 Partagez vos fan arts',
      },
      {
        name: 'memes',
        topic: 'Naruto TCG memes and funny moments \u2502 M\u00e8mes et moments dr\u00f4les',
      },
      {
        name: 'media-clips',
        topic: 'Game replays, screenshots, and video content \u2502 Replays et captures',
      },
    ],
  },

  // ════════════════════════════════════════════
  // VOICE
  // ════════════════════════════════════════════
  {
    name: '\u2550\u2550  VOICE  \u2550\u2550',
    voice: true,
    channels: [
      { name: 'Game Voice EN', topic: '' },
      { name: 'Game Voice FR', topic: '' },
      { name: 'Tournament Voice', topic: '' },
      { name: 'Chill Zone', topic: '' },
    ],
  },
];

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
      {
        name: '\u2694 Village Affiliation / Affiliation au Village',
        value: villageList,
      },
      {
        name: '\U0001F4AC Language / Langue',
        value: langList,
      },
      {
        name: '\U0001F514 Notifications',
        value: notifList,
      },
    )
    .addFields(
      {
        name: '\U0001F3C6 Rank Roles / R\u00f4les de Rang',
        value: [
          `**Kage** \u2502 ELO 2000+ (Automatic)`,
          `**Chunin** \u2502 ELO 1200-1999 (Automatic)`,
          `**Genin** \u2502 ELO < 1200 (Automatic)`,
        ].join('\n'),
      },
    )
    .setFooter({ text: 'Rank roles are assigned automatically based on your in-game ELO' })
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
      'Check the full leaderboard: https://naruto.daikicorp.fr/leaderboard',
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

  await client.login(BOT_TOKEN);
  console.log(`\n  Logged in as ${client.user.tag}\n`);

  const guild = await client.guilds.fetch(GUILD_ID);
  console.log(`  Server: ${guild.name} (${guild.memberCount} members)\n`);

  const everyoneRole = guild.roles.everyone;

  // ──────────────────────────────────────────
  // Step 1: Delete existing channels (optional safety)
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
  // Step 3: Set @everyone defaults
  // ──────────────────────────────────────────
  console.log('  [3/6] Configuring @everyone...');
  try {
    await everyoneRole.setPermissions([
      PermissionsBitField.Flags.ViewChannel,
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
    console.log('    @everyone permissions set.\n');
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
      const category = await guild.channels.create({
        name: cat.name,
        type: ChannelType.GuildCategory,
        reason: 'Server setup script',
      });
      console.log(`    [Category] ${cat.name}`);

      for (const ch of cat.channels) {
        const isVoice = cat.voice === true;
        const permissionOverwrites = [];

        // Read-only channels
        if (ch.readOnly) {
          const staffRoles = ['Hokage', 'Developer'];
          permissionOverwrites.push({
            id: everyoneRole.id,
            deny: [PermissionsBitField.Flags.SendMessages],
          });
          for (const staffName of staffRoles) {
            const staffRole = roleMap.get(staffName);
            if (staffRole) {
              permissionOverwrites.push({
                id: staffRole.id,
                allow: [PermissionsBitField.Flags.SendMessages],
              });
            }
          }
        }

        // Restricted channels (Testeur, Developer)
        if (ch.restrictTo) {
          const restrictRole = roleMap.get(ch.restrictTo);
          permissionOverwrites.push({
            id: everyoneRole.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
          });
          if (restrictRole) {
            permissionOverwrites.push({
              id: restrictRole.id,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
            });
          }
          // Hokage and Developer always see everything
          const hokage = roleMap.get('Hokage');
          const dev = roleMap.get('Developer');
          if (hokage) {
            permissionOverwrites.push({
              id: hokage.id,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
            });
          }
          if (dev && ch.restrictTo !== 'Developer') {
            permissionOverwrites.push({
              id: dev.id,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
            });
          }
        }

        const channel = await guild.channels.create({
          name: ch.name,
          type: isVoice ? ChannelType.GuildVoice : ChannelType.GuildText,
          parent: category.id,
          topic: ch.topic || undefined,
          permissionOverwrites: permissionOverwrites.length > 0 ? permissionOverwrites : undefined,
          reason: 'Server setup script',
        });

        channelMap.set(ch.name, channel);
        const prefix = isVoice ? '    \u266A' : (ch.readOnly ? '    #' : (ch.restrictTo ? '    \u26BF' : '    #'));
        const suffix = ch.readOnly ? ' [read-only]' : (ch.restrictTo ? ` [${ch.restrictTo} only]` : '');
        console.log(`${prefix} ${ch.name}${suffix}`);
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
  // Step 6: Set server icon and metadata
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
  console.log('  Role IDs for reference:');
  for (const [name, role] of roleMap) {
    console.log(`    ${name.padEnd(20)} ${role.id}`);
  }
  console.log('\n  Next steps:');
  console.log('    1. Reorder roles in Server Settings if needed');
  console.log('    2. Set up reaction roles in #pick-your-roles (use a bot like Carl-bot)');
  console.log('    3. Set the server icon to your game logo');
  console.log('    4. Configure AutoMod if desired');
  console.log('    5. Remove the setup bot if no longer needed\n');

  await client.destroy();
  process.exit(0);
}

setupServer().catch((err) => {
  console.error('\n  FATAL ERROR:', err.message);
  process.exit(1);
});
