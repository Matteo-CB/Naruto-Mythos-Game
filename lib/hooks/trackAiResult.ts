'use client';

import type { AIDifficulty } from '@/lib/ai/AIPlayer';

type ResultKind = 'won' | 'lost' | 'played';

interface BufferedEvent {
  hook: string;
  payload: Record<string, unknown>;
}

const STREAK_PREFIX = 'naruto-mythos-ai-streak-';

function readStreak(difficulty: AIDifficulty): number {
  try {
    if (typeof window === 'undefined') return 0;
    const raw = localStorage.getItem(STREAK_PREFIX + difficulty);
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeStreak(difficulty: AIDifficulty, value: number): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STREAK_PREFIX + difficulty, String(Math.max(0, value)));
  } catch {
  }
}

export function trackAiResult(difficulty: AIDifficulty, result: ResultKind, events?: BufferedEvent[]): void {
  let streak = readStreak(difficulty);
  if (result === 'won') {
    streak += 1;
    writeStreak(difficulty, streak);
  } else if (result === 'lost') {
    streak = 0;
    writeStreak(difficulty, 0);
  }

  fetch('/api/quests/track-ai-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ difficulty, result, streak, events: events ?? [] }),
    credentials: 'include',
  }).catch(() => {});
}
