import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { AIDifficulty } from '../lib/ai/AIPlayer';

type AgentMode = 'heuristic' | 'neural';
type ProgressPhase = 'running' | 'done' | 'error';

interface CliArgs {
  games: number;
  workers: number;
  a: AIDifficulty;
  b: AIDifficulty;
  aMode: AgentMode;
  bMode: AgentMode;
  swapSeats: boolean;
  decks: string;
  output: string;
  aModel: string;
  bModel: string;
  aSims: number;
  bSims: number;
  keepTemp: boolean;
  tempDir: string;
}

interface WorkerResult {
  workerIndex: number;
  outputPath: string;
  progressPath: string;
  games: number;
}

interface BenchmarkProgress {
  phase: ProgressPhase;
  currentGame: number;
  totalGames: number;
  completed: number;
  aWins: number;
  bWins: number;
  skipped: number;
  elapsedSec: number;
  rateGamesPerSec: number;
  etaSec: number;
  outputPath: string;
  timestamp: number;
  activeGame?: number;
  currentStep?: number;
  currentPhase?: string;
  currentPlayer?: string;
  currentValidActions?: number;
  currentGameElapsedSec?: number;
  message?: string;
}

interface BenchmarkSummary {
  aWins: number;
  bWins: number;
  skipped: number;
  completed: number;
  aWinrate: number;
  bWinrate: number;
  tiebreaks: number;
  totalSteps: number;
  totalDurationMs: number;
  avgSteps: number;
  avgGameTimeSec: number;
  totalTimeSec: number;
}

interface WorkerRuntime {
  workerIndex: number;
  games: number;
  outputPath: string;
  progressPath: string;
  progress: BenchmarkProgress | null;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const cpuCount = Math.max(1, os.cpus().length);
  const args: CliArgs = {
    games: 100,
    workers: Math.max(1, Math.min(8, cpuCount - 1)),
    a: 'impossible',
    b: 'impossible',
    aMode: 'neural',
    bMode: 'heuristic',
    swapSeats: true,
    decks: '',
    output: 'scripts/bench/benchmark_parallel.json',
    aModel: '',
    bModel: '',
    aSims: 0,
    bSims: 0,
    keepTemp: false,
    tempDir: '',
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--games' && argv[i + 1]) args.games = Number.parseInt(argv[++i], 10);
    if (argv[i] === '--workers' && argv[i + 1]) args.workers = Number.parseInt(argv[++i], 10);
    if (argv[i] === '--a' && argv[i + 1]) args.a = parseDifficulty(argv[++i]);
    if (argv[i] === '--b' && argv[i + 1]) args.b = parseDifficulty(argv[++i]);
    if (argv[i] === '--a-mode' && argv[i + 1]) args.aMode = parseMode(argv[++i]);
    if (argv[i] === '--b-mode' && argv[i + 1]) args.bMode = parseMode(argv[++i]);
    if (argv[i] === '--no-swap') args.swapSeats = false;
    if (argv[i] === '--decks' && argv[i + 1]) args.decks = argv[++i];
    if (argv[i] === '--output' && argv[i + 1]) args.output = argv[++i];
    if (argv[i] === '--a-model' && argv[i + 1]) args.aModel = argv[++i];
    if (argv[i] === '--b-model' && argv[i + 1]) args.bModel = argv[++i];
    if (argv[i] === '--a-sims' && argv[i + 1]) args.aSims = Number.parseInt(argv[++i], 10);
    if (argv[i] === '--b-sims' && argv[i + 1]) args.bSims = Number.parseInt(argv[++i], 10);
    if (argv[i] === '--keep-temp') args.keepTemp = true;
    if (argv[i] === '--temp-dir' && argv[i + 1]) args.tempDir = argv[++i];
  }

  args.games = Math.max(1, args.games || 1);
  args.workers = Math.max(1, args.workers || 1);
  args.aSims = Math.max(0, args.aSims || 0);
  args.bSims = Math.max(0, args.bSims || 0);
  return args;
}

function parseDifficulty(value: string): AIDifficulty {
  if (value === 'easy' || value === 'medium' || value === 'hard' || value === 'impossible') {
    return value;
  }
  throw new Error(`Invalid difficulty: ${value}`);
}

function parseMode(value: string): AgentMode {
  if (value === 'heuristic' || value === 'neural') {
    return value;
  }
  throw new Error(`Invalid mode: ${value}`);
}

function splitGames(totalGames: number, workers: number): number[] {
  const actualWorkers = Math.max(1, Math.min(workers, totalGames));
  const base = Math.floor(totalGames / actualWorkers);
  const extra = totalGames % actualWorkers;
  const chunks: number[] = [];
  for (let i = 0; i < actualWorkers; i++) {
    chunks.push(base + (i < extra ? 1 : 0));
  }
  return chunks;
}

function runWorker(workerIndex: number, games: number, args: CliArgs, outputPath: string, progressPath: string): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const childArgs = [
      '-r',
      'tsconfig-paths/register',
      'node_modules/ts-node/dist/bin.js',
      '--project',
      'scripts/tsconfig.json',
      'scripts/benchmark.ts',
      '--games',
      String(games),
      '--a',
      args.a,
      '--a-mode',
      args.aMode,
      '--b',
      args.b,
      '--b-mode',
      args.bMode,
      '--output',
      outputPath,
      '--progress-file',
      progressPath,
      '--quiet',
    ];

    if (!args.swapSeats) childArgs.push('--no-swap');
    if (args.decks) childArgs.push('--decks', args.decks);
    if (args.aModel) childArgs.push('--a-model', args.aModel);
    if (args.bModel) childArgs.push('--b-model', args.bModel);
    if (args.aSims > 0) childArgs.push('--a-sims', String(args.aSims));
    if (args.bSims > 0) childArgs.push('--b-sims', String(args.bSims));

    const child = spawn(process.execPath, childArgs, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (!text) return;
      process.stdout.write(`[W${workerIndex}] ${text}\n`);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (!text) return;
      process.stderr.write(`[W${workerIndex}] ${text}\n`);
    });

    child.on('error', (error) => reject(error));
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ workerIndex, outputPath, progressPath, games });
      } else {
        reject(new Error(`Worker ${workerIndex} failed with exit code ${code}`));
      }
    });
  });
}

function readWorkerProgress(filePath: string): BenchmarkProgress | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!raw || typeof raw !== 'object') return null;
    return raw as BenchmarkProgress;
  } catch {
    return null;
  }
}

function readWorkerSummary(filePath: string): BenchmarkSummary {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const summary = raw.summary ?? {};
  return {
    aWins: Number(summary.aWins ?? 0),
    bWins: Number(summary.bWins ?? 0),
    skipped: Number(summary.skipped ?? 0),
    completed: Number(summary.completed ?? 0),
    aWinrate: Number(summary.aWinrate ?? 0),
    bWinrate: Number(summary.bWinrate ?? 0),
    tiebreaks: Number(summary.tiebreaks ?? 0),
    totalSteps: Number(summary.totalSteps ?? 0),
    totalDurationMs: Number(summary.totalDurationMs ?? 0),
    avgSteps: Number(summary.avgSteps ?? 0),
    avgGameTimeSec: Number(summary.avgGameTimeSec ?? 0),
    totalTimeSec: Number(summary.totalTimeSec ?? 0),
  };
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  const total = Math.floor(seconds);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  if (hh > 0) {
    return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
  }
  return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}

function printProgressSnapshot(runtimes: WorkerRuntime[], totalGames: number, startedAt: number) {
  for (const runtime of runtimes) {
    runtime.progress = readWorkerProgress(runtime.progressPath);
  }

  const globalCurrent = runtimes.reduce((sum, worker) => sum + (worker.progress?.currentGame ?? 0), 0);
  const globalCompleted = runtimes.reduce((sum, worker) => sum + (worker.progress?.completed ?? 0), 0);
  const globalAWins = runtimes.reduce((sum, worker) => sum + (worker.progress?.aWins ?? 0), 0);
  const globalBWins = runtimes.reduce((sum, worker) => sum + (worker.progress?.bWins ?? 0), 0);
  const globalSkipped = runtimes.reduce((sum, worker) => sum + (worker.progress?.skipped ?? 0), 0);
  const elapsedSec = (Date.now() - startedAt) / 1000;
  const globalRate = elapsedSec > 0 ? globalCurrent / elapsedSec : 0;
  const percent = totalGames > 0 ? (globalCurrent / totalGames) * 100 : 0;
  const remaining = Math.max(0, totalGames - globalCurrent);
  const etaSec = globalRate > 0 ? remaining / globalRate : 0;

  console.log(
    `[PROGRESS] ${percent.toFixed(1)}% | ` +
      `${globalCurrent}/${totalGames} games | ` +
      `A ${globalAWins} - B ${globalBWins} | skipped ${globalSkipped} | ` +
      `${globalRate.toFixed(2)} games/s | ETA ${formatDuration(etaSec)} | ` +
      `Elapsed ${formatDuration(elapsedSec)} | Completed ${globalCompleted}`,
  );

  for (const worker of runtimes) {
    const progress = worker.progress;
    if (!progress) {
      console.log(`  W${worker.workerIndex}: starting... (0/${worker.games})`);
      continue;
    }

    const workerPercent = worker.games > 0 ? (progress.currentGame / worker.games) * 100 : 0;
    const eta = formatDuration(progress.etaSec);
    let line =
      `  W${worker.workerIndex}: ${progress.currentGame}/${worker.games} done ` +
      `(${workerPercent.toFixed(1)}%) | phase=${progress.phase} | ` +
      `A ${progress.aWins} - B ${progress.bWins} | skipped ${progress.skipped} | ETA ${eta}`;

    if (progress.activeGame !== undefined) {
      line += ` | active=${progress.activeGame}`;
    }

    if (progress.currentStep !== undefined && progress.currentPhase) {
      line +=
        ` | live: step=${progress.currentStep}` +
        ` phase=${progress.currentPhase}` +
        (progress.currentPlayer ? ` player=${progress.currentPlayer}` : '') +
        (progress.currentValidActions !== undefined ? ` actions=${progress.currentValidActions}` : '');
    }

    const staleSec = Math.max(0, (Date.now() - progress.timestamp) / 1000);
    if (staleSec >= 60 && progress.phase === 'running') {
      line += ` | stale=${formatDuration(staleSec)}`;
    }

    if (progress.phase === 'error' && progress.message) {
      line += ` | error=${progress.message}`;
    }

    console.log(line);
  }
}

async function main() {
  const args = parseArgs();
  const chunks = splitGames(args.games, args.workers);
  const actualWorkers = chunks.length;
  const tempDir = args.tempDir
    ? path.resolve(args.tempDir)
    : path.join(os.tmpdir(), `naruto-benchmark-${Date.now()}-${process.pid}`);
  fs.mkdirSync(tempDir, { recursive: true });

  console.log('='.repeat(70));
  console.log('  NARUTO MYTHOS TCG - AI benchmark parallel');
  console.log('='.repeat(70));
  console.log(`  Games total : ${args.games}`);
  console.log(`  Workers     : ${actualWorkers}`);
  console.log(`  Agent A     : ${args.a} (${args.aMode})`);
  console.log(`  Agent B     : ${args.b} (${args.bMode})`);
  if (args.aSims > 0) console.log(`  A sims      : ${args.aSims}`);
  if (args.bSims > 0) console.log(`  B sims      : ${args.bSims}`);
  if (args.aModel) console.log(`  A model     : ${args.aModel}`);
  if (args.bModel) console.log(`  B model     : ${args.bModel}`);
  if (args.decks) console.log(`  Decks       : ${args.decks}`);
  console.log(`  Output      : ${args.output}`);
  console.log(`  Temp dir    : ${tempDir}`);
  console.log('='.repeat(70));

  const start = Date.now();
  const runtimes: WorkerRuntime[] = [];
  const workerPromises: Promise<WorkerResult>[] = [];
  const progressIntervalMs = 5000;

  for (let i = 0; i < actualWorkers; i++) {
    const workerGames = chunks[i];
    const workerOutput = path.join(tempDir, `worker_${i + 1}.json`);
    const workerProgress = path.join(tempDir, `worker_${i + 1}_progress.json`);
    console.log(`  Worker ${i + 1}: ${workerGames} games`);
    runtimes.push({
      workerIndex: i + 1,
      games: workerGames,
      outputPath: workerOutput,
      progressPath: workerProgress,
      progress: null,
    });
    workerPromises.push(runWorker(i + 1, workerGames, args, workerOutput, workerProgress));
  }

  printProgressSnapshot(runtimes, args.games, start);
  const progressTimer = setInterval(() => {
    printProgressSnapshot(runtimes, args.games, start);
  }, progressIntervalMs);

  let results: WorkerResult[];
  try {
    results = await Promise.all(workerPromises);
  } finally {
    clearInterval(progressTimer);
  }

  printProgressSnapshot(runtimes, args.games, start);

  let aWins = 0;
  let bWins = 0;
  let skipped = 0;
  let completed = 0;
  let tiebreaks = 0;
  let totalSteps = 0;
  let totalDurationMs = 0;

  for (const result of results) {
    const summary = readWorkerSummary(result.outputPath);
    aWins += summary.aWins;
    bWins += summary.bWins;
    skipped += summary.skipped;
    completed += summary.completed;
    tiebreaks += summary.tiebreaks;
    totalSteps += summary.totalSteps;
    totalDurationMs += summary.totalDurationMs;
  }

  const elapsedSec = (Date.now() - start) / 1000;
  const outputPath = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        config: {
          games: args.games,
          workers: actualWorkers,
          a: args.a,
          b: args.b,
          aMode: args.aMode,
          bMode: args.bMode,
          aModel: args.aModel || null,
          bModel: args.bModel || null,
          aSims: args.aSims || null,
          bSims: args.bSims || null,
          swapSeats: args.swapSeats,
          decks: args.decks || null,
        },
        workers: results.map((result) => ({
          workerIndex: result.workerIndex,
          games: result.games,
          outputPath: result.outputPath,
          progressPath: result.progressPath,
        })),
        summary: {
          aWins,
          bWins,
          skipped,
          completed,
          aWinrate: completed > 0 ? aWins / completed : 0,
          bWinrate: completed > 0 ? bWins / completed : 0,
          tiebreaks,
          totalSteps,
          totalDurationMs,
          avgSteps: totalSteps / Math.max(1, args.games),
          avgGameTimeSec: totalDurationMs / Math.max(1, args.games) / 1000,
          totalTimeSec: elapsedSec,
        },
      },
      null,
      2,
    ),
    'utf-8',
  );

  if (!args.keepTemp) {
    for (const result of results) {
      try {
        fs.unlinkSync(result.outputPath);
      } catch {
        // ignore
      }
      try {
        fs.unlinkSync(result.progressPath);
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
  console.log('Benchmark complete');
  console.log(`A wins:        ${aWins}`);
  console.log(`B wins:        ${bWins}`);
  console.log(`Skipped:       ${skipped}`);
  if (completed > 0) {
    console.log(`A winrate:     ${(100 * aWins / completed).toFixed(1)}%`);
    console.log(`B winrate:     ${(100 * bWins / completed).toFixed(1)}%`);
  }
  console.log(`Tie-breaks:    ${tiebreaks}`);
  console.log(`Avg steps:     ${(totalSteps / Math.max(1, args.games)).toFixed(1)}`);
  console.log(`Avg game time: ${(totalDurationMs / Math.max(1, args.games) / 1000).toFixed(2)}s`);
  console.log(`Total time:    ${elapsedSec.toFixed(1)}s`);
  console.log(`Report saved:  ${outputPath}`);
  console.log('='.repeat(70));
}

main().catch((error) => {
  console.error('[benchmarkParallel] Fatal error:', error);
  process.exitCode = 1;
});
