import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const LOCALES = ['en', 'fr', 'es', 'ja', 'pt', 'it', 'pl'];
const SCAN_DIRS = ['app', 'components', 'lib', 'stores'];

type Json = Record<string, unknown>;

function loadMessages(): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const loc of LOCALES) {
    out[loc] = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages', `${loc}.json`), 'utf8')) as Json;
  }
  return out;
}

function hasKey(obj: Json, dotted: string): boolean {
  return dotted.split('.').reduce<unknown>(
    (acc, k) => (acc && typeof acc === 'object' ? (acc as Json)[k] : undefined),
    obj,
  ) !== undefined;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === '__tests__') continue;
      walk(p, out);
    } else if (/\.(tsx|ts)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

interface Decl { name: string; ns: string; index: number }

function collectMissing(): string[] {
  const messages = loadMessages();
  const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));
  const missing = new Map<string, Set<string>>();

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    if (!/useTranslations|getTranslations/.test(src)) continue;

    const decls: Decl[] = [];
    for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*useTranslations\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)/g)) {
      decls.push({ name: m[1], ns: m[2] ?? m[3] ?? '', index: m.index ?? 0 });
    }
    for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*await\s+getTranslations\(\s*\{[^}]*namespace:\s*'([^']+)'/g)) {
      decls.push({ name: m[1], ns: m[2], index: m.index ?? 0 });
    }
    for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*await\s+getTranslations\(\s*'([^']+)'\s*\)/g)) {
      decls.push({ name: m[1], ns: m[2], index: m.index ?? 0 });
    }
    if (decls.length === 0) continue;

    const names = [...new Set(decls.map((d) => d.name))].sort((a, b) => b.length - a.length).join('|');
    const callRe = new RegExp(`\\b(${names})(?:\\.rich)?\\(\\s*(['"\`])([^'"\`$]*)\\2`, 'g');

    for (const m of src.matchAll(callRe)) {
      const raw = m[3];
      if (!raw || m[2] === '`') continue;
      const callIndex = m.index ?? 0;
      let best: Decl | null = null;
      for (const d of decls) {
        if (d.name !== m[1] || d.index > callIndex) continue;
        if (!best || d.index > best.index) best = d;
      }
      if (!best) continue;
      const full = best.ns ? `${best.ns}.${raw}` : raw;
      const missingIn = LOCALES.filter((loc) => !hasKey(messages[loc], full));
      if (missingIn.length > 0) {
        const rel = path.relative(ROOT, file).replace(/\\/g, '/');
        if (!missing.has(full)) missing.set(full, new Set());
        missing.get(full)!.add(`${rel} [missing in ${missingIn.join(',')}]`);
      }
    }
  }

  return [...missing.entries()].map(([k, v]) => `${k}  <- ${[...v][0]}`).sort();
}

describe('i18n: every translation key used in the app exists in every locale', () => {
  it('has no missing key anywhere in the simulator', () => {
    const missing = collectMissing();
    expect(missing, `Missing translation keys:\n${missing.join('\n')}`).toEqual([]);
  });

  it('every locale file parses and carries the _meta block', () => {
    const messages = loadMessages();
    for (const loc of LOCALES) {
      expect(hasKey(messages[loc], '_meta.bcp47'), `${loc} is missing _meta.bcp47`).toBe(true);
      expect(hasKey(messages[loc], '_meta.ogLocale'), `${loc} is missing _meta.ogLocale`).toBe(true);
    }
  });
});
