import { describe, it, expect } from 'vitest';
import { unrankedModeKey, isSealedModeKey, sealedSetFromModeKey } from '@/lib/stats/modeKey';

describe('unrankedModeKey', () => {
  it('classifies sealed rooms per set and falls back to random', () => {
    expect(unrankedModeKey({ isSealed: true, sealedSetChoice: 'KS' })).toBe('sealed:KS');
    expect(unrankedModeKey({ isSealed: true, sealedSetChoice: 'SS' })).toBe('sealed:SS');
    expect(unrankedModeKey({ isSealed: true, sealedSetChoice: 'random' })).toBe('sealed:random');
    expect(unrankedModeKey({ isSealed: true })).toBe('sealed:random');
    expect(unrankedModeKey({ isSealed: true, sealedSetChoice: '' })).toBe('sealed:random');
  });

  it('classifies everything else as casual', () => {
    expect(unrankedModeKey({})).toBe('casual');
    expect(unrankedModeKey({ isSealed: false, sealedSetChoice: 'KS' })).toBe('casual');
  });

  it('parses sealed mode keys back, including future sets', () => {
    expect(isSealedModeKey('sealed:KS')).toBe(true);
    expect(isSealedModeKey('sealed:FUTURESET')).toBe(true);
    expect(isSealedModeKey('casual')).toBe(false);
    expect(sealedSetFromModeKey('sealed:AK')).toBe('AK');
    expect(sealedSetFromModeKey('sealed:random')).toBe('random');
  });
});
