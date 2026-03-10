import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface CliArgs {
  games: number;
  sims: number;
  workers: number;
  output: string;
  decks: string;
  keepTemp: boolean;
  tempDir: string;
}

interface WorkerResult {
  workerIndex: number;
  outputPath: string;
  progressPath: string;
  games: number;
}

type ProgressPhase = 'running' | 'done' | 'error';

interface WorkerProgress {
  phase: ProgressPhase;
  currentGame: number;
  totalGames: number;
  completed: number;
  skipped: number;
  samples: number;
  elapsedSec: number;
  rateGamesPerSec: number;
  etaSec: number;
  outputPath: string;
  sims: number;
  timestamp: number;
  message?: string;
  currentStep?: number;
  currentPhase?: string;
  currentPlayer?: string;
  currentValidActions?: number;
  currentGameElapsedSec?: number;
}

interface WorkerRuntime {
  workerIndex: number;
  games: number;
  outputPath: string;
  progressPath: string;
  progress: WorkerProgress | null;
}

interface SamplesSlice {
  start: number;
  end: number;
  hasContent: boolean;
}

const OBJECT_PREFIX = '{"samples":[';
const OBJECT_SUFFIX = ']}';
const ARRAY_PREFIX = '[';
const ARRAY_SUFFIX = ']';

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const cpuCount = Math.max(1, os.cpus().length);
  const defaults: CliArgs = {
    games: 8000,
    sims: 80,
    workers: Math.max(1, Math.min(8, cpuCount - 1)),
    output: 'scripts/training_data.json',
    decks: '',
    keepTemp: false,
    tempDir: '',
  };

  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--games' && argv[i + 1]) defaults.games = Number.parseInt(argv[++i], 10);
    if (key === '--sims' && argv[i + 1]) defaults.sims = Number.parseInt(argv[++i], 10);
    if (key === '--workers' && argv[i + 1]) defaults.workers = Number.parseInt(argv[++i], 10);
    if (key === '--output' && argv[i + 1]) defaults.output = argv[++i];
    if (key === '--decks' && argv[i + 1]) defaults.decks = argv[++i];
    if (key === '--keep-temp') defaults.keepTemp = true;
    if (key === '--temp-dir' && argv[i + 1]) defaults.tempDir = argv[++i];
  }

  defaults.games = Math.max(1, defaults.games || 1);
  defaults.sims = Math.max(1, defaults.sims || 1);
  defaults.workers = Math.max(1, defaults.workers || 1);
  return defaults;
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

function runWorker(
  workerIndex: number,
  games: number,
  sims: number,
  outputPath: string,
  progressPath: string,
  decksPath: string,
): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '-r',
      'tsconfig-paths/register',
      'node_modules/ts-node/dist/bin.js',
      '--project',
      'scripts/tsconfig.json',
      'scripts/selfplay.ts',
      '--games',
      String(games),
      '--sims',
      String(sims),
      '--output',
      outputPath,
      '--progress-file',
      progressPath,
      '--quiet',
    ];

    if (decksPath) {
      args.push('--decks', decksPath);
    }

    const child = spawn(process.execPath, args, {
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

function readWorkerProgress(filePath: string): WorkerProgress | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!raw || typeof raw !== 'object') return null;
    return raw as WorkerProgress;
  } catch {
    return null;
  }
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  const total = Math.floor(seconds);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  if (hh > 0) {
    return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}:${ss
      .toString()
      .padStart(2, '0')}`;
  }
  return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}

function printProgressSnapshot(runtimes: WorkerRuntime[], totalGames: number, startedAt: number) {
  for (const runtime of runtimes) {
    runtime.progress = readWorkerProgress(runtime.progressPath);
  }

  const globalCurrent = runtimes.reduce((sum, worker) => sum + (worker.progress?.currentGame ?? 0), 0);
  const globalSamples = runtimes.reduce((sum, worker) => sum + (worker.progress?.samples ?? 0), 0);
  const elapsedSec = (Date.now() - startedAt) / 1000;
  const globalRate = elapsedSec > 0 ? globalCurrent / elapsedSec : 0;
  const percent = totalGames > 0 ? (globalCurrent / totalGames) * 100 : 0;
  const remaining = Math.max(0, totalGames - globalCurrent);
  const etaSec = globalRate > 0 ? remaining / globalRate : 0;

  console.log(
    `[PROGRESS] ${percent.toFixed(1)}% | ` +
      `${globalCurrent}/${totalGames} games | ` +
      `${globalRate.toFixed(2)} games/s | ` +
      `ETA ${formatDuration(etaSec)} | ` +
      `Elapsed ${formatDuration(elapsedSec)} | ` +
      `Samples ${globalSamples.toLocaleString()}`,
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
      `  W${worker.workerIndex}: ${progress.currentGame}/${worker.games} ` +
      `(${workerPercent.toFixed(1)}%) | phase=${progress.phase} | ETA ${eta}`;

    if (progress.currentStep !== undefined && progress.currentPhase) {
      line +=
        ` | live: step=${progress.currentStep}` +
        ` phase=${progress.currentPhase}` +
        (progress.currentPlayer ? ` player=${progress.currentPlayer}` : '');
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

function getSamplesSlice(filePath: string): SamplesSlice {
  const size = fs.statSync(filePath).size;
  if (size <= 0) {
    return { start: 0, end: -1, hasContent: false };
  }

  const fd = fs.openSync(filePath, 'r');
  try {
    const headLen = Math.min(size, 32);
    const tailLen = Math.min(size, 32);
    const head = Buffer.alloc(headLen);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, head, 0, headLen, 0);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);

    const headText = head.toString('utf8');
    const tailText = tail.toString('utf8');

    if (headText.startsWith(OBJECT_PREFIX) && tailText.endsWith(OBJECT_SUFFIX)) {
      const start = Buffer.byteLength(OBJECT_PREFIX);
      const end = size - Buffer.byteLength(OBJECT_SUFFIX) - 1;
      return { start, end, hasContent: end >= start };
    }

    if (headText.startsWith(ARRAY_PREFIX) && tailText.endsWith(ARRAY_SUFFIX)) {
      const start = Buffer.byteLength(ARRAY_PREFIX);
      const end = size - Buffer.byteLength(ARRAY_SUFFIX) - 1;
      return { start, end, hasContent: end >= start };
    }
  } finally {
    fs.closeSync(fd);
  }

  throw new Error(`Invalid worker output format: ${filePath}`);
}

function pipeSlice(
  writer: fs.WriteStream,
  filePath: string,
  start: number,
  end: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = fs.createReadStream(filePath, {
      encoding: 'utf8',
      start,
      end,
    });

    reader.on('error', reject);
    reader.on('end', () => resolve());
    reader.pipe(writer, { end: false });
  });
}

async function mergeWorkerOutputs(results: WorkerResult[], outputPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const writer = fs.createWriteStream(outputPath, { encoding: 'utf8' });

  try {
    writer.write('{"samples":[');
    let wroteAny = false;

    for (const result of results) {
      const slice = getSamplesSlice(result.outputPath);
      if (!slice.hasContent) continue;

      if (wroteAny) {
        writer.write(',');
      }

      await pipeSlice(writer, result.outputPath, slice.start, slice.end);
      wroteAny = true;
    }

    writer.write(']}');
  } finally {
    await new Promise<void>((resolve, reject) => {
      writer.end(() => resolve());
      writer.on('error', reject);
    });
  }
}

function getWorkerSampleCount(progressPath: string): number {
  const progress = readWorkerProgress(progressPath);
  if (!progress) return 0;
  return Number.isFinite(progress.samples) ? progress.samples : 0;
}

async function main() {
  const args = parseArgs();
  const chunks = splitGames(args.games, args.workers);
  const actualWorkers = chunks.length;

  const tempDir = args.tempDir
    ? path.resolve(args.tempDir)
    : path.join(os.tmpdir(), `naruto-selfplay-${Date.now()}-${process.pid}`);
  fs.mkdirSync(tempDir, { recursive: true });

  console.log('='.repeat(70));
  console.log('  NARUTO MYTHOS TCG - Self-play parallel');
  console.log('='.repeat(70));
  console.log(`  Games total : ${args.games}`);
  console.log(`  Sims/move   : ${args.sims}`);
  console.log(`  Workers     : ${actualWorkers}`);
  console.log(`  Output      : ${args.output}`);
  if (args.decks) console.log(`  Decks       : ${args.decks}`);
  console.log(`  Temp dir    : ${tempDir}`);
  console.log('='.repeat(70));

  const start = Date.now();
  const workerPromises: Promise<WorkerResult>[] = [];
  const runtimes: WorkerRuntime[] = [];
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
    workerPromises.push(
      runWorker(i + 1, workerGames, args.sims, workerOutput, workerProgress, args.decks),
    );
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

  const outputPath = path.resolve(args.output);
  await mergeWorkerOutputs(results, outputPath);
  const mergedSampleCount = results.reduce(
    (sum, result) => sum + getWorkerSampleCount(result.progressPath),
    0,
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
      // ignore (if custom temp dir contains other files)
    }
  }

  const elapsedSec = (Date.now() - start) / 1000;
  const rate = args.games / Math.max(1, elapsedSec);
  const outputSizeMB = fs.statSync(outputPath).size / 1e6;

  console.log('\n' + '='.repeat(70));
  console.log(`Done in ${elapsedSec.toFixed(1)}s`);
  console.log(`Samples: ${mergedSampleCount.toLocaleString()}`);
  console.log(`Speed  : ${rate.toFixed(2)} games/s`);
  console.log(`Output : ${outputPath} (${outputSizeMB.toFixed(1)} MB)`);
  console.log('='.repeat(70));
}

main().catch((error) => {
  console.error('[selfplayParallel] Fatal error:', error);
  process.exitCode = 1;
});
