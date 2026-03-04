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
      // @ts-expect-error — optional runtime dependency, gracefully handled
      : await import('onnxruntime-node');
    return ortModule;
  } catch {
    return null;
  }
}

export class NeuralEvaluator {
  private static _instance: NeuralEvaluator | null = null;

  private session: InferenceSession | null = null;
  private inputName = 'input';
  private outputName = 'output';
  private _ready = false;
  private loadPromise: Promise<void> | null = null;

  private constructor() {}

  static getInstance(): NeuralEvaluator {
    if (!NeuralEvaluator._instance) {
      NeuralEvaluator._instance = new NeuralEvaluator();
    }
    return NeuralEvaluator._instance;
  }

  isReady(): boolean {
    return this._ready;
  }

  async load(modelPath?: string): Promise<void> {
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      const ort = await getOrt();
      if (!ort) {
        console.warn('[NeuralEvaluator] No ONNX runtime available. Using heuristic fallback.');
        return;
      }

      const resolvedPath = defaultModelPath(modelPath);

      try {
        const sessionOptions = isBrowserRuntime()
          ? {}
          : {
              executionProviders: ['cuda', 'cpu'],
              graphOptimizationLevel: 'all',
            };

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
        this._ready = false;
      }
    })();

    return this.loadPromise;
  }

  evaluateSync(_features: Float32Array): number {
    // The ONNX runtimes exposed here are async-only.
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
  const evaluator = NeuralEvaluator.getInstance();
  await evaluator.load(modelPath);
  return evaluator;
}
