import { prisma } from '@/lib/db/prisma';

export interface ChatScanEntry {
  messageId: string;
  roomCode: string;
  userId: string;
  username: string;
  message: string;
  channel?: 'room' | 'dm';
}

interface QueuedEntry extends ChatScanEntry {
  retried: boolean;
}

export type ScanAction = 'blocked' | 'removed' | 'flagged' | 'none';

export type HoldVerdict = 'blocked' | 'flagged' | 'none' | 'unavailable';

export interface ScanDecision {
  action: ScanAction;
  topCategory: string;
  topScore: number;
}

export const REMOVE_THRESHOLDS: Record<string, number> = {
  'hate': 0.45,
  'hate/threatening': 0.35,
  'harassment': 0.8,
  'harassment/threatening': 0.4,
  'sexual': 0.8,
  'sexual/minors': 0.2,
  'self-harm': 0.75,
  'self-harm/intent': 0.6,
  'self-harm/instructions': 0.5,
  'violence': 0.7,
  'violence/graphic': 0.8,
  'illicit/violent': 0.65,
};

export const FLAG_THRESHOLDS: Record<string, number> = {
  'hate': 0.22,
  'hate/threatening': 0.2,
  'harassment': 0.5,
  'harassment/threatening': 0.22,
  'sexual': 0.55,
  'self-harm': 0.45,
  'violence': 0.45,
  'illicit': 0.6,
};

export function decideScanAction(scores: Record<string, number>): ScanDecision {
  let action: ScanAction = 'none';
  let topCategory = '';
  let topRatio = 0;
  let topScore = 0;

  for (const [category, score] of Object.entries(scores)) {
    if (typeof score !== 'number') continue;
    const removeAt = REMOVE_THRESHOLDS[category];
    const flagAt = FLAG_THRESHOLDS[category];
    if (removeAt !== undefined && score >= removeAt) {
      const ratio = score / removeAt;
      if (action !== 'removed' || ratio > topRatio) {
        action = 'removed';
        topRatio = ratio;
        topCategory = category;
        topScore = score;
      }
    } else if (action !== 'removed' && flagAt !== undefined && score >= flagAt) {
      const ratio = score / flagAt;
      if (action !== 'flagged' || ratio > topRatio) {
        action = 'flagged';
        topRatio = ratio;
        topCategory = category;
        topScore = score;
      }
    }
  }

  if (action === 'none') {
    for (const [category, score] of Object.entries(scores)) {
      if (typeof score === 'number' && score > topScore) {
        topScore = score;
        topCategory = category;
      }
    }
  }

  return { action, topCategory, topScore };
}

const MAX_QUEUE = 2000;
const BATCH_MAX = 10;
const FALLBACK_INTERVAL_MS = 2000;
const DRAIN_DEBOUNCE_MS = 25;
const API_TIMEOUT_MS = 5000;
const SCAN_RETENTION_DAYS = 30;
const MAX_CONCURRENT_BATCHES = 6;
const RATE_LIMIT_PER_MIN = 200;
const RATE_WINDOW_MS = 60_000;

const THROTTLE_BACKOFF_MS = 60_000;

const queue: QueuedEntry[] = [];
let removalHandler: ((roomCode: string, messageId: string) => void) | null = null;
let fallbackTimer: ReturnType<typeof setInterval> | null = null;
let disabledLogged = false;
let activeBatches = 0;
let drainScheduled = false;
let pausedUntil = 0;
let throttleLogged = false;
const requestTimes: number[] = [];

function rateBudgetLeft(): boolean {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  while (requestTimes.length > 0 && requestTimes[0] < cutoff) requestTimes.shift();
  return requestTimes.length < RATE_LIMIT_PER_MIN;
}

function scheduleDrain(): void {
  if (drainScheduled || !process.env.OPENAI_API_KEY) return;
  drainScheduled = true;
  setTimeout(() => { drainScheduled = false; drain(); }, DRAIN_DEBOUNCE_MS);
}

export function enqueueChatScan(entry: ChatScanEntry): void {
  if (!process.env.OPENAI_API_KEY) return;
  if (Date.now() < pausedUntil && queue.length >= MAX_QUEUE) return;
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push({ ...entry, retried: false });
  scheduleDrain();
}

export function chatScanQueueSize(): number {
  return queue.length;
}

interface ModerationApiResult {
  results?: Array<{ category_scores?: Record<string, number> }>;
}

async function callModerationApi(texts: string[], timeoutMs: number = API_TIMEOUT_MS): Promise<Array<Record<string, number>> | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: texts }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 429) {
      pausedUntil = Date.now() + THROTTLE_BACKOFF_MS;
      if (!throttleLogged) {
        console.warn('[autoScan] moderation API 429 (account quota is zero: add credit once to unlock the free moderation tier), backing off');
        throttleLogged = true;
      }
      return null;
    }
    if (!res.ok) {
      console.warn(`[autoScan] moderation API HTTP ${res.status}`);
      return null;
    }
    throttleLogged = false;
    const data = (await res.json()) as ModerationApiResult;
    if (!Array.isArray(data.results) || data.results.length !== texts.length) return null;
    return data.results.map((r) => r.category_scores ?? {});
  } catch (e) {
    console.warn('[autoScan] moderation API failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

async function persistScan(entry: ChatScanEntry, decision: ScanDecision, scores: Record<string, number>): Promise<void> {
  try {
    if (!entry.username) {
      const u = await prisma.user.findUnique({ where: { id: entry.userId }, select: { username: true } }).catch(() => null);
      entry.username = u?.username ?? '?';
    }
    await prisma.chatModerationScan.create({
      data: {
        messageId: entry.messageId,
        roomCode: entry.roomCode,
        userId: entry.userId,
        username: entry.username,
        message: entry.message,
        provider: 'openai',
        categories: scores,
        topCategory: decision.topCategory,
        topScore: decision.topScore,
        action: decision.action,
      },
    });
  } catch (e) {
    console.warn('[autoScan] persist failed:', e instanceof Error ? e.message : e);
  }
}

const HOLD_TIMEOUT_MS = 900;

export async function holdScanMessage(entry: ChatScanEntry): Promise<HoldVerdict> {
  if (!process.env.OPENAI_API_KEY || Date.now() < pausedUntil || !rateBudgetLeft()) return 'unavailable';
  requestTimes.push(Date.now());
  const scoresList = await callModerationApi([entry.message], HOLD_TIMEOUT_MS);
  if (!scoresList) return 'unavailable';
  const decision = decideScanAction(scoresList[0]);
  if (decision.action === 'none') return 'none';
  const finalAction: ScanAction = decision.action === 'removed' ? 'blocked' : 'flagged';
  void persistScan(entry, { ...decision, action: finalAction }, scoresList[0]);
  return finalAction;
}

async function runBatch(batch: QueuedEntry[]): Promise<void> {
  const scoresList = await callModerationApi(batch.map((b) => b.message));
  if (!scoresList) {
    for (const entry of batch) {
      if (!entry.retried && queue.length < MAX_QUEUE) {
        queue.push({ ...entry, retried: true });
      }
    }
    return;
  }
  const persists: Array<Promise<void>> = [];
  for (let i = 0; i < batch.length; i++) {
    const entry = batch[i];
    const decision = decideScanAction(scoresList[i]);
    if (decision.action === 'none') continue;
    if (decision.action === 'removed' && entry.channel === 'dm') {
      decision.action = 'flagged';
    }
    if (decision.action === 'removed' && removalHandler) {
      try { removalHandler(entry.roomCode, entry.messageId); } catch { /* never break the worker */ }
    }
    persists.push(persistScan(entry, decision, scoresList[i]));
  }
  await Promise.allSettled(persists);
}

function drain(): void {
  if (Date.now() < pausedUntil) {
    setTimeout(scheduleDrain, pausedUntil - Date.now() + 50);
    return;
  }
  while (queue.length > 0 && activeBatches < MAX_CONCURRENT_BATCHES && rateBudgetLeft()) {
    const batch = queue.splice(0, BATCH_MAX);
    requestTimes.push(Date.now());
    activeBatches++;
    void runBatch(batch).catch(() => { /* never break the worker */ }).finally(() => {
      activeBatches--;
      if (queue.length > 0) scheduleDrain();
    });
  }
  if (queue.length > 0 && activeBatches < MAX_CONCURRENT_BATCHES && !rateBudgetLeft()) {
    setTimeout(scheduleDrain, 1000);
  }
}

export function initChatAutoScan(onRemove: (roomCode: string, messageId: string) => void): void {
  removalHandler = onRemove;
  if (!process.env.OPENAI_API_KEY) {
    if (!disabledLogged) {
      console.warn('[autoScan] OPENAI_API_KEY missing, AI chat moderation disabled (word filter still active)');
      disabledLogged = true;
    }
    return;
  }
  if (fallbackTimer) return;
  fallbackTimer = setInterval(() => { if (queue.length > 0) drain(); }, FALLBACK_INTERVAL_MS);
  console.log('[autoScan] AI chat moderation worker started (concurrent, immediate drain)');
}

export async function cleanupOldScans(): Promise<void> {
  const cutoff = new Date(Date.now() - SCAN_RETENTION_DAYS * 86400000);
  await prisma.chatModerationScan.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => {});
}
