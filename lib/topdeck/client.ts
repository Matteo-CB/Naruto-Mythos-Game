import {
  TOPDECK_BASE_URL,
  TOPDECK_RATE_CAP_PER_MIN,
  TOPDECK_RATE_WINDOW_MS,
  TOPDECK_MAX_RETRIES,
  TOPDECK_BASE_BACKOFF_MS,
  TOPDECK_MAX_BACKOFF_MS,
} from './constants';
import { createTokenBucket, type TokenBucket } from './rateLimiter';
import { createSingleFlight } from './singleFlight';

export class TopdeckConfigError extends Error {
  code = 'NO_API_KEY' as const;
}

export class TopdeckRateLimitError extends Error {
  code = 'RATE_LIMITED' as const;
  retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super('TopDeck rate limit exceeded after retries');
    this.retryAfterMs = retryAfterMs;
  }
}

export class TopdeckHttpError extends Error {
  code = 'HTTP_ERROR' as const;
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface TopdeckClientDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  apiKey?: string;
}

export interface TopdeckClient {
  get(path: string): Promise<unknown>;
  post(path: string, body: unknown): Promise<unknown>;
  bucket: TokenBucket;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - now);
  return null;
}

export function createTopdeckClient(deps: TopdeckClientDeps = {}): TopdeckClient {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  const bucket = createTokenBucket({
    capacity: TOPDECK_RATE_CAP_PER_MIN,
    refillPerWindow: TOPDECK_RATE_CAP_PER_MIN,
    windowMs: TOPDECK_RATE_WINDOW_MS,
    now,
  });
  const sf = createSingleFlight();

  function resolveApiKey(): string {
    const key = deps.apiKey ?? process.env.TOPDECK_API_KEY;
    if (!key) throw new TopdeckConfigError('TOPDECK_API_KEY is not set');
    return key;
  }

  function backoffMs(attempt: number): number {
    return Math.min(TOPDECK_BASE_BACKOFF_MS * Math.pow(2, attempt), TOPDECK_MAX_BACKOFF_MS);
  }

  async function waitForToken(): Promise<void> {
    while (!bucket.tryTake(1)) {
      const waitMs = Math.min(bucket.msUntilNextToken() || 50, TOPDECK_RATE_WINDOW_MS);
      await sleep(waitMs);
    }
  }

  async function rawRequest(method: string, path: string, body?: unknown): Promise<unknown> {
    const apiKey = resolveApiKey();
    const url = path.startsWith('http')
      ? path
      : `${TOPDECK_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;

    let attempt = 0;
    for (;;) {
      await waitForToken();
      const res = await fetchImpl(url, {
        method,
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
        body: body != null ? JSON.stringify(body) : undefined,
      });

      if (res.status === 429) {
        const retryAfterMs = parseRetryAfter(res.headers.get('Retry-After'), now()) ?? backoffMs(attempt);
        attempt++;
        if (attempt > TOPDECK_MAX_RETRIES) throw new TopdeckRateLimitError(retryAfterMs);
        await sleep(retryAfterMs);
        continue;
      }

      if (!res.ok) {
        if (res.status >= 500 && attempt < TOPDECK_MAX_RETRIES) {
          attempt++;
          await sleep(backoffMs(attempt));
          continue;
        }
        throw new TopdeckHttpError(res.status, `TopDeck ${method} ${path} -> ${res.status}`);
      }

      return res.json();
    }
  }

  return {
    get(path: string): Promise<unknown> {
      return sf.run(`GET ${path}`, () => rawRequest('GET', path));
    },
    post(path: string, body: unknown): Promise<unknown> {
      return sf.run(`POST ${path} ${JSON.stringify(body ?? null)}`, () => rawRequest('POST', path, body));
    },
    bucket,
  };
}

let serverClient: TopdeckClient | null = null;

export function topdeckClient(): TopdeckClient {
  if (typeof window !== 'undefined') {
    throw new Error('topdeckClient is server-only and must never be called from the browser');
  }
  if (!serverClient) serverClient = createTopdeckClient();
  return serverClient;
}
