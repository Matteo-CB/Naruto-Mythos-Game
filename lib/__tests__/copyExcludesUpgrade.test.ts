import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isCopyableEffectType } from '@/lib/effects/handlers/KS/shared/copyExclusions';

const COPY_FILTER_FILES = [
  'lib/effects/EffectEngine.ts',
  'lib/engine/GameEngine.ts',
  'lib/effects/handlers/KS/uncommon/sakon062.ts',
  'lib/effects/handlers/KS/uncommon/kakashi016.ts',
];

const ROOT = join(__dirname, '..', '..');

describe('Copy filter — UPGRADE (effect alteration) is never copyable by any copy effect', () => {
  it('isCopyableEffectType rejects SCORE and UPGRADE, accepts instant effect types', () => {
    expect(isCopyableEffectType('MAIN')).toBe(true);
    expect(isCopyableEffectType('AMBUSH')).toBe(true);
    expect(isCopyableEffectType('DUEL')).toBe(true);
    expect(isCopyableEffectType('UPGRADE')).toBe(false);
    expect(isCopyableEffectType('SCORE')).toBe(false);
  });

  it('no copy path conditionally re-enables copying UPGRADE (Sakon/Kakashi 148 exceptions stay removed)', () => {
    for (const f of COPY_FILTER_FILES) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      expect(src, `${f} must not conditionally allow copying an UPGRADE effect`).not.toMatch(/['"]UPGRADE['"]\s*&&\s*!/);
    }
  });

  it('every copy-filter file resolves effect-type copyability through the shared predicate', () => {
    for (const f of COPY_FILTER_FILES) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      expect(src, `${f} should route copyability through isCopyableEffectType`).toContain('isCopyableEffectType');
    }
  });
});
