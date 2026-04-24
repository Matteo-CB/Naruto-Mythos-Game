

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';



try {
  const envContent = readFileSync('.env', 'utf8');
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
} catch {
  
}

const DEFAULT_USERNAMES = ['Konoha_Senpu', 'Zensho'];

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const force = args.includes('--force');
const skipDiscord = args.includes('--skip-discord');
const usernames = args.filter((a) => !a.startsWith('--'));
const targets = usernames.length > 0 ? usernames : DEFAULT_USERNAMES;

const prisma = new PrismaClient();


const DISCORD_API = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.BOT_DISCORD_TOKEN;
const GUILD_ID = process.env.SERVER_DISCORD_ID;

function discordReady() {
  return Boolean(BOT_TOKEN && GUILD_ID);
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
    const retryAfter = ((body.retry_after ?? 1) * 1000) + 100;
    console.warn(`[Discord] Rate limited, retrying after ${retryAfter}ms…`);
    await new Promise((r) => setTimeout(r, retryAfter));
    return discordFetch(path, options, retries - 1);
  }
  return res;
}


async function loadManagedRoleIds() {
  const settings = await prisma.siteSettings.findUnique({ where: { key: 'global' } });
  const map = settings?.discordRoleIds ?? null;
  if (!map || typeof map !== 'object') return [];
  return Object.values(map).filter((v) => typeof v === 'string' && v.length > 0);
}


async function removeAllManagedRolesFromMember(discordId, managedRoleIds) {
  if (!discordReady()) return { skipped: true, removed: 0, errors: 0 };
  if (!discordId) return { skipped: true, removed: 0, errors: 0 };
  if (managedRoleIds.length === 0) return { skipped: true, removed: 0, errors: 0 };

  try {
    const memberRes = await discordFetch(`/guilds/${GUILD_ID}/members/${discordId}`);
    if (memberRes.status === 404) {
      console.log(`    Discord: member ${discordId} not in guild, nothing to clean`);
      return { skipped: true, removed: 0, errors: 0 };
    }
    if (!memberRes.ok) {
      console.warn(`    Discord: failed to fetch member ${discordId} (HTTP ${memberRes.status})`);
      return { skipped: false, removed: 0, errors: 1 };
    }
    const member = await memberRes.json();
    const currentRoles = new Set(Array.isArray(member.roles) ? member.roles : []);
    const toRemove = managedRoleIds.filter((id) => currentRoles.has(id));

    let removed = 0;
    let errors = 0;
    for (const roleId of toRemove) {
      const res = await discordFetch(
        `/guilds/${GUILD_ID}/members/${discordId}/roles/${roleId}`,
        { method: 'DELETE' },
      );
      if (res.ok || res.status === 204) {
        removed++;
      } else {
        console.warn(`    Discord: failed to remove role ${roleId} (HTTP ${res.status})`);
        errors++;
      }
      await new Promise((r) => setTimeout(r, 250)); // gentle rate-limit
    }
    return { skipped: false, removed, errors };
  } catch (err) {
    console.warn(`    Discord: unexpected error for ${discordId}: ${err?.message ?? err}`);
    return { skipped: false, removed: 0, errors: 1 };
  }
}

async function resolveUsers(names) {
  
  const users = await prisma.user.findMany({
    where: { username: { in: names } },
    select: { id: true, username: true, email: true, createdAt: true, discordId: true },
  });
  const found = new Set(users.map((u) => u.username));
  const missing = names.filter((n) => !found.has(n));
  return { users, missing };
}

async function checkActiveTournaments(userIds) {
  const active = await prisma.tournamentParticipant.findMany({
    where: {
      userId: { in: userIds },
      tournament: {
        status: { notIn: ['completed', 'cancelled'] },
      },
    },
    include: {
      tournament: { select: { id: true, name: true, status: true } },
    },
  });
  return active;
}

async function countFootprint(user) {
  const uid = user.id;
  const [
    accounts,
    decks,
    friendshipsSent,
    friendshipsReceived,
    matchInvitesSent,
    matchInvitesReceived,
    quizScores,
    userBans,
    chatReportsAsReporter,
    chatReportsAsTarget,
    chatMessages,
    tournamentParticipants,
    gamesAsPlayer1,
    gamesAsPlayer2,
    gamesAsWinner,
    tournamentMatchesP1,
    tournamentMatchesP2,
    tournamentMatchesWinner,
    tournamentsCreated,
    rooms,
  ] = await Promise.all([
    prisma.account.count({ where: { userId: uid } }),
    prisma.deck.count({ where: { userId: uid } }),
    prisma.friendship.count({ where: { senderId: uid } }),
    prisma.friendship.count({ where: { receiverId: uid } }),
    prisma.matchInvite.count({ where: { senderId: uid } }),
    prisma.matchInvite.count({ where: { receiverId: uid } }),
    prisma.quizScore.count({ where: { userId: uid } }),
    prisma.userBan.count({ where: { userId: uid } }),
    prisma.chatReport.count({ where: { reporterId: uid } }),
    prisma.chatReport.count({ where: { targetId: uid } }),
    prisma.chatMessage.count({ where: { userId: uid } }),
    prisma.tournamentParticipant.count({ where: { userId: uid } }),
    prisma.game.count({ where: { player1Id: uid } }),
    prisma.game.count({ where: { player2Id: uid } }),
    prisma.game.count({ where: { winnerId: uid } }),
    prisma.tournamentMatch.count({ where: { player1Id: uid } }),
    prisma.tournamentMatch.count({ where: { player2Id: uid } }),
    prisma.tournamentMatch.count({ where: { winnerId: uid } }),
    prisma.tournament.count({ where: { creatorId: uid } }),
    prisma.room.count({ where: { OR: [{ hostId: uid }, { guestId: uid }] } }),
  ]);

  return {
    hardDelete: {
      accounts, decks,
      friendships: friendshipsSent + friendshipsReceived,
      matchInvites: matchInvitesSent + matchInvitesReceived,
      quizScores, userBans,
      chatReports: chatReportsAsReporter + chatReportsAsTarget,
      chatMessages, tournamentParticipants, rooms,
    },
    anonymize: {
      gamesAsPlayer1, gamesAsPlayer2, gamesAsWinner,
      tournamentMatchesP1, tournamentMatchesP2, tournamentMatchesWinner,
    },
    orphan: {
      tournamentsCreated,
    },
  };
}

async function deleteUserCascade(user) {
  const uid = user.id;
  const results = {};

  
  results.decks = (await prisma.deck.deleteMany({ where: { userId: uid } })).count;
  results.friendships = (await prisma.friendship.deleteMany({
    where: { OR: [{ senderId: uid }, { receiverId: uid }] },
  })).count;
  results.matchInvites = (await prisma.matchInvite.deleteMany({
    where: { OR: [{ senderId: uid }, { receiverId: uid }] },
  })).count;
  results.quizScores = (await prisma.quizScore.deleteMany({ where: { userId: uid } })).count;
  results.userBans = (await prisma.userBan.deleteMany({ where: { userId: uid } })).count;
  results.chatReports = (await prisma.chatReport.deleteMany({
    where: { OR: [{ reporterId: uid }, { targetId: uid }] },
  })).count;
  results.chatMessages = (await prisma.chatMessage.deleteMany({ where: { userId: uid } })).count;
  results.tournamentParticipants = (await prisma.tournamentParticipant.deleteMany({
    where: { userId: uid },
  })).count;
  results.rooms = (await prisma.room.deleteMany({
    where: { OR: [{ hostId: uid }, { guestId: uid }] },
  })).count;
  
  
  results.accounts = (await prisma.account.deleteMany({ where: { userId: uid } })).count;

  
  results.gamesAsPlayer1 = (await prisma.game.updateMany({
    where: { player1Id: uid }, data: { player1Id: null },
  })).count;
  results.gamesAsPlayer2 = (await prisma.game.updateMany({
    where: { player2Id: uid }, data: { player2Id: null },
  })).count;
  results.gamesAsWinner = (await prisma.game.updateMany({
    where: { winnerId: uid }, data: { winnerId: null },
  })).count;
  results.tournamentMatchesP1 = (await prisma.tournamentMatch.updateMany({
    where: { player1Id: uid }, data: { player1Id: null },
  })).count;
  results.tournamentMatchesP2 = (await prisma.tournamentMatch.updateMany({
    where: { player2Id: uid }, data: { player2Id: null },
  })).count;
  results.tournamentMatchesWinner = (await prisma.tournamentMatch.updateMany({
    where: { winnerId: uid }, data: { winnerId: null },
  })).count;

  
  await prisma.user.delete({ where: { id: uid } });
  results.userDeleted = 1;

  return results;
}

async function main() {
  console.log('='.repeat(60));
  console.log(`Target usernames: ${targets.join(', ')}`);
  console.log(`Mode: ${confirm ? 'LIVE (will delete)' : 'DRY-RUN (pass --confirm to execute)'}`);
  console.log('='.repeat(60));

  const { users, missing } = await resolveUsers(targets);
  if (missing.length > 0) {
    console.warn(`WARNING: these usernames were not found: ${missing.join(', ')}`);
  }
  if (users.length === 0) {
    console.log('No matching users. Nothing to do.');
    return;
  }

  for (const u of users) {
    console.log(`\n- ${u.username} (id: ${u.id}, email: ${u.email}, created: ${u.createdAt.toISOString()}, discord: ${u.discordId ?? '-'})`);
    const foot = await countFootprint(u);
    console.log('  hard-delete:');
    for (const [k, v] of Object.entries(foot.hardDelete)) console.log(`    ${k.padEnd(26)} ${v}`);
    console.log('  anonymize (keep row, null fk):');
    for (const [k, v] of Object.entries(foot.anonymize)) console.log(`    ${k.padEnd(26)} ${v}`);
    console.log('  left orphaned (unchanged):');
    for (const [k, v] of Object.entries(foot.orphan)) console.log(`    ${k.padEnd(26)} ${v}`);
  }

  
  if (skipDiscord) {
    console.log('\nDiscord cleanup: skipped (--skip-discord).');
  } else if (!discordReady()) {
    console.log('\nDiscord cleanup: DISABLED (BOT_DISCORD_TOKEN or SERVER_DISCORD_ID not set).');
    console.log('  Set both env vars to have the script remove ELO/Unranked roles, or use --skip-discord to silence this.');
  } else {
    const linked = users.filter((u) => u.discordId).length;
    console.log(`\nDiscord cleanup: ENABLED. ${linked}/${users.length} user(s) have a linked discordId.`);
  }

  const active = await checkActiveTournaments(users.map((u) => u.id));
  if (active.length > 0) {
    console.log('\nACTIVE TOURNAMENT PARTICIPATION DETECTED:');
    for (const p of active) {
      console.log(`  - ${p.username} is in tournament "${p.tournament.name}" (status: ${p.tournament.status})`);
    }
    if (!force) {
      console.error('\nRefusing to proceed because at least one user is in an active tournament.');
      console.error('Either wait for the tournament to finish, or pass --force to override.');
      process.exit(2);
    } else {
      console.warn('--force provided: proceeding despite active tournament participation.');
    }
  }

  if (!confirm) {
    console.log('\nDry-run complete. Re-run with --confirm to actually delete.');
    return;
  }

  
  const managedRoleIds = !skipDiscord && discordReady() ? await loadManagedRoleIds() : [];
  if (!skipDiscord && discordReady() && managedRoleIds.length === 0) {
    console.warn('\nWARNING: Discord cleanup enabled but SiteSettings.discordRoleIds is empty.');
    console.warn('  No roles will be removed. Configure discordRoleIds or pass --skip-discord.');
  }

  console.log('\nDeleting…');
  for (const u of users) {
    console.log(`\n- ${u.username} (id: ${u.id})`);

    
    if (!skipDiscord && u.discordId && managedRoleIds.length > 0) {
      const discordRes = await removeAllManagedRolesFromMember(u.discordId, managedRoleIds);
      if (discordRes.skipped) {
        console.log(`    discord                     skipped`);
      } else {
        console.log(`    discord rolesRemoved        ${discordRes.removed}`);
        if (discordRes.errors > 0) console.log(`    discord errors              ${discordRes.errors}`);
      }
    } else if (!skipDiscord && !u.discordId) {
      console.log(`    discord                     no linked account`);
    }

    
    const res = await deleteUserCascade(u);
    for (const [k, v] of Object.entries(res)) console.log(`    ${k.padEnd(28)} ${v}`);
  }

  console.log('\nDone.');
}

main()
  .catch((e) => {
    console.error('Error:', e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
