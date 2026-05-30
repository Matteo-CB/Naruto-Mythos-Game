import { NextRequest, NextResponse } from 'next/server';
import os from 'node:os';
import { runPollerTick } from '@/lib/topdeck/poller';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

let cachedInstanceId: string | null = null;
function instanceId(): string {
  if (!cachedInstanceId) cachedInstanceId = `${os.hostname()}-${process.pid}`;
  return cachedInstanceId;
}

async function handle(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runPollerTick(instanceId());
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('[cron/topdeck-poll] failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'Poll failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
