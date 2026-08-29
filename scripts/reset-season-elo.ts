import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { eloApresReset, PLAFOND_DE_DEBUT_DE_SAISON, TRANCHES_DE_COMPRESSION } from '@/lib/elo/resetDeSaison';
import { SAISON_ARCHIVEE } from '@/lib/badges/saisonBadges';
import { ligueDe, niveauRomain, niveauDe } from '@/lib/leagues/paliers';

const env = readFileSync('.env', 'utf8');
for (const ligne of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(ligne.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const APPLIQUER = process.argv.includes('--apply');
const SANS_ARCHIVE = process.argv.includes('--sans-archive');
const saisonArg = process.argv.find((a) => a.startsWith('--season='));
const SAISON = (saisonArg ? saisonArg.split('=')[1] : SAISON_ARCHIVEE).toUpperCase();

const LOT = 200;

async function main() {
  const prisma = new PrismaClient();

  const archivees = await prisma.seasonRanking.count({ where: { seasonId: SAISON } });
  if (archivees === 0 && !SANS_ARCHIVE) {
    console.log(`La saison ${SAISON} n est pas archivee. Lancer d abord scripts/archive-season.ts --apply.`);
    console.log('Le classement de fin de saison serait perdu. Utiliser --sans-archive pour passer outre.');
    await prisma.$disconnect();
    return;
  }

  const joueurs = await prisma.user.findMany({ select: { id: true, username: true, elo: true } });
  const changements = joueurs
    .map((j) => ({ ...j, nouveau: eloApresReset(j.elo) }))
    .filter((j) => j.nouveau !== j.elo);
  const pertes = changements.map((c) => c.elo - c.nouveau).sort((a, b) => a - b);
  const apres = joueurs.map((j) => eloApresReset(j.elo)).sort((a, b) => a - b);

  console.log(APPLIQUER ? '=== REMISE A NIVEAU APPLIQUEE ===' : '=== SIMULATION, rien ecrit ===');
  console.log('bareme                        :', TRANCHES_DE_COMPRESSION
    .map((t) => `${Number.isFinite(t.jusqua) ? `<${t.jusqua}` : 'au-dela'}:${Math.round(t.taux * 100)}%`).join('  '));
  console.log('plafond de debut de saison    :', PLAFOND_DE_DEBUT_DE_SAISON);
  console.log('lignes archivees pour la saison:', archivees);
  console.log('comptes en base               :', joueurs.length);
  console.log('comptes modifies              :', changements.length);
  console.log('comptes inchanges             :', joueurs.length - changements.length);
  if (pertes.length > 0) {
    console.log('perte mediane                 :', pertes[Math.floor(pertes.length / 2)]);
    console.log('perte maximale                :', pertes[pertes.length - 1]);
  }
  console.log('elo le plus haut apres        :', apres[apres.length - 1]);
  console.log('l elo Evolving n est pas touche.');

  const plusTouches = [...changements].sort((a, b) => (b.elo - b.nouveau) - (a.elo - a.nouveau)).slice(0, 10);
  console.log('\nles dix plus gros ajustements:');
  for (const c of plusTouches) {
    const ligne = `${ligueDe(c.nouveau)} ${niveauRomain(niveauDe(c.nouveau))}`;
    console.log(`  ${c.username.padEnd(20)} ${String(c.elo).padStart(5)} -> ${String(c.nouveau).padStart(4)}  (${ligne})`);
  }

  if (!APPLIQUER) {
    console.log('\nRelancer avec --apply pour ecrire.');
    await prisma.$disconnect();
    return;
  }

  let faits = 0;
  for (let i = 0; i < changements.length; i += LOT) {
    const lot = changements.slice(i, i + LOT);
    await Promise.all(lot.map((c) => prisma.user.update({ where: { id: c.id }, data: { elo: c.nouveau } })));
    faits += lot.length;
    console.log(`  ${faits}/${changements.length}`);
  }
  console.log('comptes mis a jour            :', faits);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
