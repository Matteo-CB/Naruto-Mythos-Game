import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isCopyableEffect, isCopyableEffectType } from '@/lib/effects/handlers/KS/shared/copyExclusions';

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

  it('every copy-filter file resolves copyability through the shared predicate, and none re-implements it', () => {
    for (const f of COPY_FILTER_FILES) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      expect(src, `${f} should route copyability through isCopyableEffect`).toContain('isCopyableEffect(');
      expect(src, `${f} must not call isCopyableEffectType directly, the shared predicate carries every rule`)
        .not.toContain('isCopyableEffectType(');
      expect(src, `${f} must not re-implement the effect-alteration filter locally`)
        .not.toContain('UPGRADE|SCORE)');
    }
  });

  it('a FIRST STRIKE effect is copyable only when the copier is the first card played this round', () => {
    const premiere = { type: 'FIRST_STRIKE', description: '[↯] Hide a character.' };
    expect(isCopyableEffect(premiere, { wasFirstCard: true })).toBe(true);
    expect(isCopyableEffect(premiere, { wasFirstCard: false })).toBe(false);
    expect(isCopyableEffect(premiere, {})).toBe(false);
  });

  it('an AMBUSH effect stays copyable only when the copier was revealed', () => {
    const embuscade = { type: 'AMBUSH', description: '[↯] Draw a card.' };
    expect(isCopyableEffect(embuscade, { wasRevealed: true })).toBe(true);
    expect(isCopyableEffect(embuscade, { wasRevealed: false })).toBe(false);
  });

  it('a continuous effect and an effect alteration are never copyable', () => {
    expect(isCopyableEffect({ type: 'MAIN', description: '[⧗] This character has +1 Power.' }, {})).toBe(false);
    expect(isCopyableEffect({ type: 'MAIN', description: 'AMBUSH effect: Instead, defeat them.' }, {})).toBe(false);
    expect(isCopyableEffect({ type: 'MAIN', description: 'FIRST STRIKE effect: Instead, defeat them.' }, {})).toBe(false);
    expect(isCopyableEffect({ type: 'UPGRADE', description: '[↯] Draw a card.' }, {})).toBe(false);
    expect(isCopyableEffect({ type: 'SCORE', description: '[↯] Draw a card.' }, {})).toBe(false);
  });
});
