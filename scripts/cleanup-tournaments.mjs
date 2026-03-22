import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

// Load .env manually (no dotenv dependency)
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
} catch { /* .env not found */ }

const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning up tournament data...');

  const matchCount = await prisma.tournamentMatch.deleteMany({});
  console.log(`  Deleted ${matchCount.count} tournament matches`);

  const participantCount = await prisma.tournamentParticipant.deleteMany({});
  console.log(`  Deleted ${participantCount.count} tournament participants`);

  const tournamentCount = await prisma.tournament.deleteMany({});
  console.log(`  Deleted ${tournamentCount.count} tournaments`);

  console.log('Done. All tournament data cleared.');
}

main()
  .catch((e) => { console.error('Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
