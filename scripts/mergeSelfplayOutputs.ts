import * as fs from 'fs';
import * as path from 'path';

interface CliArgs {
  tempDir: string;
  output: string;
  cleanup: boolean;
}

interface WorkerFile {
  workerIndex: number;
  outputPath: string;
  progressPath: string;
}

interface SamplesSlice {
  start: number;
  end: number;
  hasContent: boolean;
}

interface WorkerProgress {
  samples?: number;
}

const OBJECT_PREFIX = '{"samples":[';
const OBJECT_SUFFIX = ']}';
const ARRAY_PREFIX = '[';
const ARRAY_SUFFIX = ']';

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = {
    tempDir: '',
    output: 'scripts/training_data_merged.json',
    cleanup: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--temp-dir' && argv[i + 1]) args.tempDir = argv[++i];
    if (key === '--output' && argv[i + 1]) args.output = argv[++i];
    if (key === '--cleanup') args.cleanup = true;
  }

  if (!args.tempDir) {
    throw new Error('Missing --temp-dir');
  }

  return args;
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

async function mergeWorkerOutputs(workerFiles: WorkerFile[], outputPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const writer = fs.createWriteStream(outputPath, { encoding: 'utf8' });

  try {
    writer.write('{"samples":[');
    let wroteAny = false;

    for (const worker of workerFiles) {
      const slice = getSamplesSlice(worker.outputPath);
      if (!slice.hasContent) continue;

      if (wroteAny) {
        writer.write(',');
      }

      await pipeSlice(writer, worker.outputPath, slice.start, slice.end);
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

function getWorkerFiles(tempDir: string): WorkerFile[] {
  if (!fs.existsSync(tempDir)) {
    throw new Error(`Temp dir not found: ${tempDir}`);
  }

  const entries = fs.readdirSync(tempDir);
  const files = entries
    .map((name) => {
      const match = /^worker_(\d+)\.json$/.exec(name);
      if (!match) return null;
      const workerIndex = Number.parseInt(match[1], 10);
      return {
        workerIndex,
        outputPath: path.join(tempDir, name),
        progressPath: path.join(tempDir, `worker_${workerIndex}_progress.json`),
      } as WorkerFile;
    })
    .filter((entry): entry is WorkerFile => entry !== null)
    .sort((a, b) => a.workerIndex - b.workerIndex);

  if (files.length === 0) {
    throw new Error(`No worker_*.json files found in: ${tempDir}`);
  }

  return files;
}

function readWorkerSamples(progressPath: string): number {
  if (!fs.existsSync(progressPath)) return 0;
  try {
    const raw = JSON.parse(fs.readFileSync(progressPath, 'utf8')) as WorkerProgress;
    if (typeof raw.samples === 'number' && Number.isFinite(raw.samples)) return raw.samples;
  } catch {
    // ignore
  }
  return 0;
}

function cleanupTempDir(workerFiles: WorkerFile[], tempDir: string) {
  for (const worker of workerFiles) {
    try {
      fs.unlinkSync(worker.outputPath);
    } catch {
      // ignore
    }
    try {
      fs.unlinkSync(worker.progressPath);
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

async function main() {
  const args = parseArgs();
  const tempDir = path.resolve(args.tempDir);
  const outputPath = path.resolve(args.output);
  const start = Date.now();

  const workerFiles = getWorkerFiles(tempDir);
  console.log('='.repeat(70));
  console.log('  NARUTO MYTHOS TCG - Merge self-play worker outputs');
  console.log('='.repeat(70));
  console.log(`  Temp dir    : ${tempDir}`);
  console.log(`  Workers     : ${workerFiles.length}`);
  console.log(`  Output      : ${outputPath}`);
  console.log('='.repeat(70));

  await mergeWorkerOutputs(workerFiles, outputPath);
  const sampleCount = workerFiles.reduce(
    (sum, worker) => sum + readWorkerSamples(worker.progressPath),
    0,
  );
  const elapsedSec = (Date.now() - start) / 1000;
  const sizeMB = fs.statSync(outputPath).size / 1e6;

  if (args.cleanup) {
    cleanupTempDir(workerFiles, tempDir);
  }

  console.log('\n' + '='.repeat(70));
  console.log(`Done in ${elapsedSec.toFixed(1)}s`);
  console.log(`Samples: ${sampleCount.toLocaleString()}`);
  console.log(`Output : ${outputPath} (${sizeMB.toFixed(1)} MB)`);
  console.log('='.repeat(70));
}

main().catch((error) => {
  console.error('[mergeSelfplayOutputs] Fatal error:', error);
  process.exitCode = 1;
});
