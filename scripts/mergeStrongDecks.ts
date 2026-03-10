import * as fs from 'fs';
import * as path from 'path';

interface DeckEntry {
  id?: string;
  name?: string;
  cardIds: string[];
  missionIds: string[];
  sourceScore?: number;
}

interface DeckFile {
  decks?: DeckEntry[];
}

interface CliArgs {
  inputA: string;
  inputB: string;
  output: string;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = {
    inputA: 'ai_training/strong_decks_curated.json',
    inputB: 'ai_training/strong_decks_db.json',
    output: 'ai_training/strong_decks_merged.json',
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--a' && argv[i + 1]) args.inputA = argv[++i];
    if (argv[i] === '--b' && argv[i + 1]) args.inputB = argv[++i];
    if (argv[i] === '--output' && argv[i + 1]) args.output = argv[++i];
  }

  return args;
}

function loadDecks(filePath: string): DeckEntry[] {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) return [];
  const raw = JSON.parse(fs.readFileSync(abs, 'utf-8')) as DeckFile | DeckEntry[];
  const decks = Array.isArray(raw) ? raw : (raw.decks ?? []);
  if (!Array.isArray(decks)) return [];
  return decks.filter((deck) =>
    Array.isArray(deck.cardIds) &&
    Array.isArray(deck.missionIds) &&
    deck.cardIds.length > 0 &&
    deck.missionIds.length > 0,
  );
}

function deckSignature(deck: DeckEntry): string {
  const chars = [...deck.cardIds].sort().join(',');
  const missions = [...deck.missionIds].sort().join(',');
  return `${chars}::${missions}`;
}

function mergeDecks(listA: DeckEntry[], listB: DeckEntry[]): DeckEntry[] {
  const merged = new Map<string, DeckEntry>();

  for (const deck of [...listA, ...listB]) {
    const signature = deckSignature(deck);
    const existing = merged.get(signature);
    if (!existing) {
      merged.set(signature, deck);
      continue;
    }

    const scoreA = existing.sourceScore ?? 0;
    const scoreB = deck.sourceScore ?? 0;
    if (scoreB > scoreA) {
      merged.set(signature, deck);
    }
  }

  return [...merged.values()].sort((a, b) => (b.sourceScore ?? 0) - (a.sourceScore ?? 0));
}

function main() {
  const args = parseArgs();
  const decksA = loadDecks(args.inputA);
  const decksB = loadDecks(args.inputB);
  const merged = mergeDecks(decksA, decksB);

  const outputPath = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceCandidates: decksA.length + decksB.length,
        decks: merged,
      },
      null,
      2,
    ),
    'utf-8',
  );

  console.log('='.repeat(60));
  console.log('  NARUTO MYTHOS TCG - Merge strong decks');
  console.log('='.repeat(60));
  console.log(`  Input A : ${args.inputA} (${decksA.length})`);
  console.log(`  Input B : ${args.inputB} (${decksB.length})`);
  console.log(`  Output  : ${args.output}`);
  console.log(`  Merged  : ${merged.length}`);
  console.log('='.repeat(60));
}

main();
