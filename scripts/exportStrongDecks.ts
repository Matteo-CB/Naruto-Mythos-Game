import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '@/lib/db/prisma';
import { rankStrongDeckSources } from '@/lib/ai/decks/deckSourceRanking';

interface CliArgs {
  output: string;
  limit: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: CliArgs = {
    output: 'ai_training/strong_decks.json',
    limit: 10,
  };

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === '--output' && args[i + 1]) {
      parsed.output = args[++i];
    } else if (token === '--limit' && args[i + 1]) {
      const limit = Number.parseInt(args[++i], 10);
      if (Number.isFinite(limit)) {
        parsed.limit = Math.max(1, Math.min(50, limit));
      }
    }
  }

  return parsed;
}

async function main() {
  const { output, limit } = parseArgs();
  console.log('='.repeat(60));
  console.log('  NARUTO MYTHOS TCG - Export des decks forts IA');
  console.log('='.repeat(60));
  console.log(`  Limite: ${limit}`);
  console.log(`  Sortie: ${output}`);

  const candidates = await prisma.deck.findMany({
    take: 400,
    orderBy: [{ updatedAt: 'desc' }],
    include: {
      user: {
        select: {
          elo: true,
          wins: true,
          losses: true,
          draws: true,
        },
      },
    },
  });

  const ranked = rankStrongDeckSources(
    candidates.map((deck) => ({
      id: deck.id,
      name: deck.name,
      cardIds: deck.cardIds,
      missionIds: deck.missionIds,
      updatedAt: deck.updatedAt,
      owner: deck.user
        ? {
            elo: deck.user.elo,
            wins: deck.user.wins,
            losses: deck.user.losses,
            draws: deck.user.draws,
          }
        : undefined,
    })),
    limit,
  );

  const outputPath = path.resolve(output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceCandidates: candidates.length,
        decks: ranked,
      },
      null,
      2,
    ),
    'utf-8',
  );

  console.log(`  Candidats scannés: ${candidates.length}`);
  console.log(`  Decks exportés: ${ranked.length}`);
  console.log(`  Fichier écrit: ${outputPath}`);
}

main()
  .catch((error) => {
    console.error('[exportStrongDecks] Erreur:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
