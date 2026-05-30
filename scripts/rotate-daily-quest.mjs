#!/usr/bin/env node
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const envContent = readFileSync('.env', 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
}

const here = dirname(fileURLToPath(import.meta.url));
const questDataPath = resolve(here, '..', 'lib', 'quests', 'questData.ts');

function readQuestIds() {
  const src = readFileSync(questDataPath, 'utf8');
  const ids = [];
  const rx = /id:\s*'([a-z0-9-]+)'/g;
  let m;
  while ((m = rx.exec(src))) ids.push(m[1]);
  return ids;
}

function hashStringToSeed(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickQuestId(date, allIds, recentIds) {
  const recent = new Set(recentIds);
  const pool = allIds.filter((id) => !recent.has(id));
  const arr = pool.length > 0 ? pool : allIds;
  const rng = mulberry32(hashStringToSeed(`daily:${date}`));
  return arr[Math.floor(rng() * arr.length)];
}

function formatDateUTC(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const RECENT_WINDOW_DAYS = 7;

const prisma = new PrismaClient();

async function main() {
  const arg = process.argv[2];
  const today = arg ?? formatDateUTC(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    throw new Error(`Invalid date arg "${today}", expected YYYY-MM-DD`);
  }

  const existing = await prisma.dailyQuestAssignment.findUnique({ where: { date: today } });
  if (existing) {
    console.log(JSON.stringify({ ok: true, date: today, questId: existing.questId, created: false }, null, 2));
    return;
  }

  const allIds = readQuestIds();
  if (allIds.length === 0) throw new Error('No quest ids found in questData.ts');

  const lookback = new Date(`${today}T00:00:00Z`);
  lookback.setUTCDate(lookback.getUTCDate() - RECENT_WINDOW_DAYS);
  const recent = await prisma.dailyQuestAssignment.findMany({
    where: { date: { gte: formatDateUTC(lookback), lt: today } },
    select: { questId: true },
  });
  const recentIds = recent.map((r) => r.questId);

  const questId = pickQuestId(today, allIds, recentIds);

  try {
    await prisma.dailyQuestAssignment.create({ data: { date: today, questId } });
    console.log(JSON.stringify({ ok: true, date: today, questId, created: true }, null, 2));
  } catch (err) {
    const winner = await prisma.dailyQuestAssignment.findUnique({ where: { date: today } });
    if (winner) {
      console.log(JSON.stringify({ ok: true, date: today, questId: winner.questId, created: false }, null, 2));
    } else {
      throw err;
    }
  }
}

main()
  .catch((e) => {
    console.error('[rotate-daily-quest] error:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
