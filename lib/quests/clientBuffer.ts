'use client';

import { onQuestEvent, type QuestEventPayload } from './hooks';

interface BufferedEvent {
  hook: string;
  payload: QuestEventPayload;
}

const MAX_BUFFER = 500;
let buffer: BufferedEvent[] = [];
let unsubscribe: (() => void) | null = null;

export function startQuestBuffer(): void {
  buffer = [];
  if (unsubscribe) unsubscribe();
  unsubscribe = onQuestEvent((hook, userId, payload) => {
    if (userId === 'local-player' && buffer.length < MAX_BUFFER) {
      buffer.push({ hook, payload: payload ?? {} });
    }
  });
}

export function drainQuestBuffer(): BufferedEvent[] {
  const events = buffer;
  buffer = [];
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  return events;
}
