import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { classementDeSaison, PARTIES_DE_PLACEMENT } from '@/lib/badges/classementDeSaison';
import { echelleDeLaSaison } from '@/lib/leagues/paliers';
import { PALIERS_DE_BADGE, SAISON_ARCHIVEE } from '@/lib/badges/saisonBadges';

const env = readFileSync('.env', 'utf8');
for (const ligne of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(ligne.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const APPLIQUER = process.argv.includes('--apply');
const REMPLACER = process.argv.includes('--replace');
const saisonArg = process.argv.find((a) => a.startsWith('--season='));
const minimumArg = process.argv.find((a) => a.startsWith('--min-parties='));
const SAISON = (saisonArg ? saisonArg.split('=')[1] : SAISON_ARCHIVEE).toUpperCase();
const MINIMUM = minimumArg ? Number(minimumArg.split('=')[1]) : PARTIES_DE_PLACEMENT;

async function main() {
  const prisma = new PrismaClient();

  const joueurs = await prisma.user.findMany({
    select: { id: true, username: true, elo: true, wins: true, losses: true, draws: true, countryCode: true },
  });
  const classement = classementDeSaison(joueurs, MINIMUM, echelleDeLaSaison(SAISON));
  const deja = await prisma.seasonRanking.count({ where: { seasonId: SAISON } });

  console.log(APPLIQUER ? `=== ARCHIVAGE DE LA SAISON ${SAISON} ===` : `=== SIMULATION saison ${SAISON}, rien ecrit ===`);
  console.log('comptes en base                 :', joueurs.length);
  console.log(`joueurs classes (>= ${MINIMUM} parties) :`, classement.length);
  console.log('lignes deja archivees           :', deja);
  for (const palier of PALIERS_DE_BADGE) {
    const n = classement.filter((l) => l.badge === palier.badge).length;
    console.log(`badge ${palier.badge.padEnd(8)}               : ${n} joueur(s)`);
  }
  console.log('\npremiers du classement:');
  for (const l of classement.slice(0, 10)) {
    console.log(`  ${String(l.rank).padStart(3)}. ${l.username.padEnd(20)} ${String(l.elo).padStart(5)} elo  ${l.wins}V ${l.losses}D  badge ${(l.badge ?? '-').padEnd(8)} ligue ${l.league}`);
  }

  if (deja > 0 && !REMPLACER) {
    console.log(`\nLa saison ${SAISON} est deja archivee. Relancer avec --replace pour la reecrire.`);
    await prisma.$disconnect();
    return;
  }
  if (!APPLIQUER) {
    console.log('\nRelancer avec --apply pour ecrire.');
    await prisma.$disconnect();
    return;
  }

  if (deja > 0) {
    const efface = await prisma.seasonRanking.deleteMany({ where: { seasonId: SAISON } });
    console.log('\nlignes remplacees               :', efface.count);
  }

  let ecrites = 0;
  for (const l of classement) {
    await prisma.seasonRanking.create({
      data: {
        seasonId: SAISON,
        userId: l.userId,
        username: l.username,
        rank: l.rank,
        elo: l.elo,
        wins: l.wins,
        losses: l.losses,
        draws: l.draws,
        games: l.games,
        countryCode: l.countryCode,
        badge: l.badge,
        league: l.league,
        leagueLevel: l.leagueLevel,
      },
    });
    ecrites++;
  }
  console.log('lignes archivees                :', ecrites);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
