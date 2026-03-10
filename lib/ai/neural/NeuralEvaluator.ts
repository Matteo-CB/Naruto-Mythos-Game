import { FEATURE_DIM } from './FeatureExtractor';

// Lazy import to avoid crashing when the runtime package is missing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrtModule = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InferenceSession = any;

let ortModule: OrtModule | null = null;

function isBrowserRuntime(): boolean {
  return typeof window !== 'undefined';
}

function getPreferredExecutionProviders(): string[] {
  if (isBrowserRuntime()) return [];

  const envOverride = process.env.NARUTO_ORT_PROVIDERS?.trim();
  if (envOverride) {
    return envOverride
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  switch (process.platform) {
    case 'win32':
      return ['dml', 'cpu'];
    case 'linux':
      return ['cuda', 'cpu'];
    default:
      return ['cpu'];
  }
}

function defaultModelPath(modelPath?: string): string {
  if (modelPath) return modelPath;

  if (isBrowserRuntime()) {
    return '/models/naruto_ai.onnx';
  }

  const cwd = process.cwd().replace(/\\/g, '/');
  return `${cwd}/public/models/naruto_ai.onnx`;
}

async function getOrt(): Promise<OrtModule | null> {
  if (ortModule) return ortModule;

  try {
    ortModule = isBrowserRuntime()
      ? await import('onnxruntime-web')
      : await import('onnxruntime-node');
    return ortModule;
  } catch {
    return null;
  }
}

export class NeuralEvaluator {
  private static _instances = new Map<string, NeuralEvaluator>();

  private session: InferenceSession | null = null;
  private inputName = 'input';
  private outputName = 'output';
  private _ready = false;
  private loadPromise: Promise<void> | null = null;
  private loadedModelPath = '';
  private modelPathHint?: string;

  private constructor(modelPathHint?: string) {
    this.modelPathHint = modelPathHint;
  }

  static getInstance(modelPath?: string): NeuralEvaluator {
    const key = (modelPath ?? '__default__').replace(/\\/g, '/').trim() || '__default__';
    const existing = NeuralEvaluator._instances.get(key);
    if (existing) return existing;

    const created = new NeuralEvaluator(modelPath);
    NeuralEvaluator._instances.set(key, created);
    return created;
  }

  static clearInstances(): void {
    for (const evaluator of NeuralEvaluator._instances.values()) {
      evaluator.session = null;
      evaluator._ready = false;
      evaluator.loadPromise = null;
      evaluator.loadedModelPath = '';
    }
    NeuralEvaluator._instances.clear();
  }

  isReady(): boolean {
    return this._ready;
  }

  async load(modelPath?: string): Promise<void> {
    const resolvedPath = defaultModelPath(modelPath ?? this.modelPathHint);
    if (this._ready && this.session && this.loadedModelPath === resolvedPath) {
      return;
    }
    if (this.loadPromise && this.loadedModelPath === resolvedPath) {
      return this.loadPromise;
    }

    this.loadedModelPath = resolvedPath;
    this.loadPromise = (async () => {
      const ort = await getOrt();
      if (!ort) {
        console.warn('[NeuralEvaluator] No ONNX runtime available. Using heuristic fallback.');
        return;
      }

      try {
        const sessionOptions = isBrowserRuntime()
          ? {}
          : {
              executionProviders: getPreferredExecutionProviders(),
              graphOptimizationLevel: 'all',
            };

        if (!isBrowserRuntime()) {
          console.log(
            `[NeuralEvaluator] Requested providers: ${sessionOptions.executionProviders.join(', ')}`,
          );
        }

        this.session = await ort.InferenceSession.create(resolvedPath, sessionOptions);

        if (this.session.inputNames.length > 0) {
          this.inputName = this.session.inputNames[0];
        }
        if (this.session.outputNames.length > 0) {
          this.outputName = this.session.outputNames[0];
        }

        this._ready = true;
        console.log(`[NeuralEvaluator] Model loaded from: ${resolvedPath}`);
        console.log(`[NeuralEvaluator] Input: "${this.inputName}", Output: "${this.outputName}"`);
      } catch (err) {
        console.warn(`[NeuralEvaluator] Failed to load model: ${err}. Using heuristic fallback.`);
        this.session = null;
        this._ready = false;
        this.loadedModelPath = '';
      }
    })();

    return this.loadPromise;
  }

  evaluateSync(features: Float32Array): number {
    // The ONNX runtimes exposed here are async-only.
    void features;
    return 0.5;
  }

  async evaluateBatch(batch: Float32Array[]): Promise<number[]> {
    if (!this._ready || !this.session) {
      return batch.map(() => 0.5);
    }

    const ort = await getOrt();
    if (!ort) return batch.map(() => 0.5);

    const n = batch.length;
    const combined = new Float32Array(n * FEATURE_DIM);
    for (let i = 0; i < n; i++) {
      combined.set(batch[i], i * FEATURE_DIM);
    }

    const tensor = new ort.Tensor('float32', combined, [n, FEATURE_DIM]);
    const results = await this.session.run({
      [this.inputName]: tensor,
    });

    const output = results[this.outputName];
    const data = output.data as Float32Array;

    return Array.from({ length: n }, (_, i) => Math.max(0, Math.min(1, data[i])));
  }

  async evaluateSingle(features: Float32Array): Promise<number> {
    const results = await this.evaluateBatch([features]);
    return results[0];
  }
}

export async function initNeuralEvaluator(modelPath?: string): Promise<NeuralEvaluator> {
  const evaluator = NeuralEvaluator.getInstance(modelPath);
  await evaluator.load(modelPath);
  return evaluator;
}
