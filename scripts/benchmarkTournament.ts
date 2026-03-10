import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { AIDifficulty } from '../lib/ai/AIPlayer';

interface ModelEntry {
  name: string;
  path: string;
}

interface MatchupResult {
  aName: string;
  bName: string;
  aModelPath: string;
  bModelPath: string;
  completed: number;
  skipped: number;
  aWins: number;
  bWins: number;
  aWinrate: number;
}

interface Standing {
  model: string;
  games: number;
  wins: number;
  losses: number;
  skipped: number;
  winrate: number;
  elo: number;
}

interface CliArgs {
  models: string;
  games: number;
  decks: string;
  output: string;
  difficulty: AIDifficulty;
  keepTemp: boolean;
  tempDir: string;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = {
    models: 'ai_training/model_zoo.json',
    games: 120,
    decks: 'ai_training/strong_decks_train.json',
    output: 'scripts/bench/model_tournament.json',
    difficulty: 'impossible',
    keepTemp: false,
    tempDir: '',
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--models' && argv[i + 1]) args.models = argv[++i];
    if (argv[i] === '--games' && argv[i + 1]) args.games = Number.parseInt(argv[++i], 10);
    if (argv[i] === '--decks' && argv[i + 1]) args.decks = argv[++i];
    if (argv[i] === '--output' && argv[i + 1]) args.output = argv[++i];
    if (argv[i] === '--difficulty' && argv[i + 1]) args.difficulty = parseDifficulty(argv[++i]);
    if (argv[i] === '--keep-temp') args.keepTemp = true;
    if (argv[i] === '--temp-dir' && argv[i + 1]) args.tempDir = argv[++i];
  }

  args.games = Math.max(1, args.games || 1);
  return args;
}

function parseDifficulty(value: string): AIDifficulty {
  if (value === 'easy' || value === 'medium' || value === 'hard' || value === 'impossible') {
    return value;
  }
  throw new Error(`Invalid difficulty: ${value}`);
}

function loadModels(filePath: string): ModelEntry[] {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Model list not found: ${abs}`);
  }

  const raw = JSON.parse(fs.readFileSync(abs, 'utf-8'));
  const models = Array.isArray(raw) ? raw : (raw.models ?? []);
  if (!Array.isArray(models)) {
    throw new Error(`Invalid model list format: ${abs}`);
  }

  const result: ModelEntry[] = [];
  const seen = new Set<string>();
  for (const entry of models) {
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    const modelPath = typeof entry.path === 'string' ? entry.path.trim() : '';
    if (!name || !modelPath) continue;

    const absModelPath = path.resolve(modelPath);
    if (!fs.existsSync(absModelPath)) {
      throw new Error(`Model file does not exist: ${absModelPath}`);
    }

    if (seen.has(name)) {
      throw new Error(`Duplicate model name in list: ${name}`);
    }
    seen.add(name);

    result.push({
      name,
      path: absModelPath,
    });
  }

  if (result.length < 2) {
    throw new Error('Need at least 2 models for a tournament');
  }

  return result;
}

function runBenchmarkPairing(params: {
  a: ModelEntry;
  b: ModelEntry;
  games: number;
  decks: string;
  difficulty: AIDifficulty;
  outputPath: string;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-r',
      'tsconfig-paths/register',
      'node_modules/ts-node/dist/bin.js',
      '--project',
      'scripts/tsconfig.json',
      'scripts/benchmark.ts',
      '--games',
      String(params.games),
      '--a',
      params.difficulty,
      '--a-mode',
      'neural',
      '--a-model',
      params.a.path,
      '--b',
      params.difficulty,
      '--b-mode',
      'neural',
      '--b-model',
      params.b.path,
      '--decks',
      params.decks,
      '--output',
      params.outputPath,
    ];

    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    });

    child.on('error', (error) => reject(error));
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Benchmark exited with code ${code}`));
    });
  });
}

function readBenchmarkSummary(filePath: string): Omit<MatchupResult, 'aName' | 'bName' | 'aModelPath' | 'bModelPath'> {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const summary = raw.summary ?? {};
  const completed = Number(summary.completed ?? 0);
  const aWins = Number(summary.aWins ?? 0);
  const bWins = Number(summary.bWins ?? 0);
  const skipped = Number(summary.skipped ?? 0);
  const aWinrate = completed > 0 ? aWins / completed : 0;

  return {
    completed,
    skipped,
    aWins,
    bWins,
    aWinrate,
  };
}

function computeStandings(models: ModelEntry[], matchups: MatchupResult[]): Standing[] {
  const stats = new Map<string, Standing>();
  const ratings = new Map<string, number>();

  for (const model of models) {
    stats.set(model.name, {
      model: model.name,
      games: 0,
      wins: 0,
      losses: 0,
      skipped: 0,
      winrate: 0,
      elo: 1500,
    });
    ratings.set(model.name, 1500);
  }

  for (const matchup of matchups) {
    const aName = matchup.aName;
    const bName = matchup.bName;

    const aStat = stats.get(aName)!;
    const bStat = stats.get(bName)!;

    aStat.games += matchup.completed;
    bStat.games += matchup.completed;
    aStat.wins += matchup.aWins;
    aStat.losses += matchup.bWins;
    bStat.wins += matchup.bWins;
    bStat.losses += matchup.aWins;
    aStat.skipped += matchup.skipped;
    bStat.skipped += matchup.skipped;

    if (matchup.completed > 0) {
      const ra = ratings.get(aName)!;
      const rb = ratings.get(bName)!;
      const expectedA = 1 / (1 + Math.pow(10, (rb - ra) / 400));
      const scoreA = matchup.aWinrate;
      const scoreB = 1 - scoreA;
      const weight = Math.max(1, matchup.completed / 100);
      const k = 24 * weight;

      ratings.set(aName, ra + k * (scoreA - expectedA));
      ratings.set(bName, rb + k * (scoreB - (1 - expectedA)));
    }
  }

  for (const entry of stats.values()) {
    entry.winrate = entry.games > 0 ? entry.wins / entry.games : 0;
    entry.elo = Number((ratings.get(entry.model) ?? 1500).toFixed(1));
  }

  return [...stats.values()].sort((a, b) => b.elo - a.elo);
}

async function main() {
  const args = parseArgs();
  const models = loadModels(args.models);
  const decksPath = path.resolve(args.decks);
  if (!fs.existsSync(decksPath)) {
    throw new Error(`Deck file not found: ${decksPath}`);
  }

  const tempDir = args.tempDir
    ? path.resolve(args.tempDir)
    : path.join(os.tmpdir(), `naruto-tournament-${Date.now()}-${process.pid}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const pairings: Array<{ a: ModelEntry; b: ModelEntry }> = [];
  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      pairings.push({ a: models[i], b: models[j] });
    }
  }

  console.log('='.repeat(70));
  console.log('  NARUTO MYTHOS TCG - Model tournament');
  console.log('='.repeat(70));
  console.log(`  Models      : ${models.length}`);
  console.log(`  Pairings    : ${pairings.length}`);
  console.log(`  Games/pair  : ${args.games}`);
  console.log(`  Difficulty  : ${args.difficulty}`);
  console.log(`  Decks       : ${decksPath}`);
  console.log(`  Temp dir    : ${tempDir}`);
  console.log(`  Output      : ${args.output}`);
  console.log('='.repeat(70));

  const matchupResults: MatchupResult[] = [];

  for (let i = 0; i < pairings.length; i++) {
    const pairing = pairings[i];
    console.log(
      `\n[${i + 1}/${pairings.length}] ${pairing.a.name} vs ${pairing.b.name}`,
    );

    const resultPath = path.join(tempDir, `pair_${i + 1}.json`);
    await runBenchmarkPairing({
      a: pairing.a,
      b: pairing.b,
      games: args.games,
      decks: decksPath,
      difficulty: args.difficulty,
      outputPath: resultPath,
    });

    const result = readBenchmarkSummary(resultPath);
    matchupResults.push({
      aName: pairing.a.name,
      bName: pairing.b.name,
      aModelPath: pairing.a.path,
      bModelPath: pairing.b.path,
      ...result,
    });
    console.log(
      `  -> Completed=${result.completed} | A wins=${result.aWins} | ` +
        `B wins=${result.bWins} | A winrate=${(result.aWinrate * 100).toFixed(1)}%`,
    );
  }

  const standings = computeStandings(models, matchupResults);

  const outputPath = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        config: {
          modelList: path.resolve(args.models),
          gamesPerPairing: args.games,
          difficulty: args.difficulty,
          decks: decksPath,
        },
        models,
        matchups: matchupResults,
        standings,
      },
      null,
      2,
    ),
    'utf-8',
  );

  if (!args.keepTemp) {
    for (let i = 0; i < pairings.length; i++) {
      try {
        fs.unlinkSync(path.join(tempDir, `pair_${i + 1}.json`));
      } catch {
        // ignore
      }
    }
    try {
      fs.rmdirSync(tempDir);
    } catch {
      // ignore
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('Tournament done');
  for (let i = 0; i < standings.length; i++) {
    const s = standings[i];
    console.log(
      `#${i + 1} ${s.model} | ELO ${s.elo.toFixed(1)} | ` +
        `W ${s.wins} / L ${s.losses} | Winrate ${(s.winrate * 100).toFixed(1)}%`,
    );
  }
  console.log(`Report: ${outputPath}`);
  console.log('='.repeat(70));
}

main().catch((error) => {
  console.error('[benchmarkTournament] Fatal error:', error);
  process.exitCode = 1;
});
