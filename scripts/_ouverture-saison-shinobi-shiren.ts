import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

const env = readFileSync('.env', 'utf8');
for (const ligne of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(ligne.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const APPLIQUER = process.argv.includes('--apply');

const BOOSTERS_A_OFFRIR: ReadonlyArray<{ setId: string; quantite: number }> = [
  { setId: 'KS', quantite: 10 },
  { setId: 'SS', quantite: 15 },
];

async function main() {
  const prisma = new PrismaClient();

  const joueurs = await prisma.user.findMany({
    select: { id: true, battlepassXp: true, battlepassTier: true, infiniteBoostersGranted: true },
  });

  const avecProgression = joueurs.filter(
    (j) => j.battlepassXp > 0 || j.battlepassTier > 0 || j.infiniteBoostersGranted > 0,
  );

  const inventaireAvant = await prisma.boosterInventory.groupBy({
    by: ['setId'],
    _sum: { count: true },
  });

  console.log(APPLIQUER ? '=== OUVERTURE DE SAISON APPLIQUEE ===' : '=== SIMULATION, rien ecrit ===');
  console.log('joueurs en base                     :', joueurs.length);
  console.log('joueurs avec une progression a effacer:', avecProgression.length);
  console.log('boosters en stock avant              :',
    inventaireAvant.map((r) => `${r.setId}=${r._sum.count ?? 0}`).join(' ') || 'aucun');
  for (const { setId, quantite } of BOOSTERS_A_OFFRIR) {
    console.log(`a offrir                             : ${quantite} x ${setId} soit ${quantite * joueurs.length} au total`);
  }

  if (!APPLIQUER) {
    await prisma.$disconnect();
    return;
  }

  const remise = await prisma.user.updateMany({
    data: { battlepassXp: 0, battlepassTier: 0, infiniteBoostersGranted: 0 },
  });
  console.log('progressions remises a zero          :', remise.count);

  let offerts = 0;
  for (const joueur of joueurs) {
    for (const { setId, quantite } of BOOSTERS_A_OFFRIR) {
      await prisma.boosterInventory.upsert({
        where: { userId_setId: { userId: joueur.id, setId } },
        create: { userId: joueur.id, setId, count: quantite },
        update: { count: { increment: quantite } },
      });
      offerts += quantite;
    }
  }
  console.log('boosters offerts                     :', offerts);

  const inventaireApres = await prisma.boosterInventory.groupBy({
    by: ['setId'],
    _sum: { count: true },
  });
  console.log('boosters en stock apres              :',
    inventaireApres.map((r) => `${r.setId}=${r._sum.count ?? 0}`).join(' '));

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
