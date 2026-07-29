import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const HANDLER_ROOT = 'lib/effects/handlers';

const ALLOWED_WITHOUT_CONFIRM = new Set<string>([
  'SAKURA011_DRAW',
  'SS049_FS_CHAR',
  'SS114_CHOOSE_DISCARD',
]);

function everyHandlerFile(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) everyHandlerFile(full, out);
    else if (entry.endsWith('.ts') && entry !== 'index.ts') out.push(full);
  }
  return out;
}

interface Offender {
  file: string;
  handler: string;
  selectionType: string;
}

function optionalSelectionsWithoutConfirm(): Offender[] {
  const offenders: Offender[] = [];
  for (const file of everyHandlerFile(HANDLER_ROOT)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/function (\w+)\(ctx: EffectContext\): EffectResult \{([\s\S]*?)\n\}/g)) {
      const [, handler, body] = match;
      if (!/requiresTargetSelection:\s*true/.test(body)) continue;
      if (!/isOptional:\s*true/.test(body)) continue;
      if (/return confirmFirst\(/.test(body)) continue;
      const selectionType = (body.match(/targetSelectionType:\s*'([^']+)'/) ?? [])[1];
      if (!selectionType) continue;
      if (selectionType.includes('_CONFIRM_')) continue;
      if (ALLOWED_WITHOUT_CONFIRM.has(selectionType)) continue;
      offenders.push({ file: file.replace(/\\/g, '/'), handler, selectionType });
    }
  }
  return offenders;
}

describe('an optional effect always asks before it resolves', () => {
  it('every optional effect uses a _CONFIRM_ selection type so the prompt window shows', () => {
    const offenders = optionalSelectionsWithoutConfirm();
    const report = offenders.map((o) => `${o.selectionType} (${o.handler} in ${o.file})`);
    expect(report, `optional effects that would silently resolve:\n  ${report.join('\n  ')}`).toEqual([]);
  });

  it('the exception list stays small and deliberate', () => {
    expect(ALLOWED_WITHOUT_CONFIRM.size).toBeLessThanOrEqual(3);
  });
});
