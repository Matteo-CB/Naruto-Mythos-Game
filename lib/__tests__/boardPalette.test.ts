import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BOARD_PALETTE,
  contrastRatio,
  hexToRgbTriple,
  isDefaultBoardPalette,
  isLowContrastOnBoard,
  lighten,
  normalizeHexColor,
  readableForegroundOn,
  resolveBoardPalette,
  validateStoredBoardPalette,
  withAlpha,
} from '@/lib/game/boardPalette';

describe('normalizeHexColor', () => {
  it('accepts 6-digit hex and lowercases it', () => {
    expect(normalizeHexColor('#C4A35A')).toBe('#c4a35a');
    expect(normalizeHexColor('  #b33e3e ')).toBe('#b33e3e');
  });

  it('expands 3-digit shorthand to 6 digits', () => {
    expect(normalizeHexColor('#fa0')).toBe('#ffaa00');
  });

  it('rejects everything that is not a plain hex color', () => {
    for (const bad of [
      'rgb(1,2,3)',
      'rgba(1,2,3,0.5)',
      'hsl(10, 50%, 50%)',
      'red',
      '#c4a35aff',
      'var(--accent)',
      'url(x)',
      '#fff) ;color:red',
      '#12345',
      '',
      null,
      undefined,
      42,
      {},
    ]) {
      expect(normalizeHexColor(bad as unknown)).toBeNull();
    }
  });
});

describe('resolveBoardPalette', () => {
  it('reproduces the historical board colors when nothing is stored', () => {
    const palette = resolveBoardPalette(null);
    expect(palette.me.primary).toBe('#c4a35a');
    expect(palette.me.bright).toBe('#f0d890');
    expect(palette.opponent.primary).toBe('#b33e3e');
    expect(palette.opponent.bright).toBe('#ff9b9b');
  });

  it('keeps the historical bright value when the primary is left at its default', () => {
    const palette = resolveBoardPalette({ me: { primary: '#c4a35a' } });
    expect(palette.me.bright).toBe('#f0d890');
  });

  it('derives a lighter bright value from a custom primary', () => {
    const palette = resolveBoardPalette({ me: { primary: '#2255aa' } });
    expect(palette.me.primary).toBe('#2255aa');
    expect(palette.me.bright).toBe(lighten('#2255aa', 0.28));
    expect(palette.me.bright).not.toBe('#2255aa');
  });

  it('honours an explicit bright override', () => {
    const palette = resolveBoardPalette({ opponent: { primary: '#101010', bright: '#00ff00' } });
    expect(palette.opponent.bright).toBe('#00ff00');
  });

  it('merges partial stored palettes with the defaults', () => {
    const palette = resolveBoardPalette({ opponent: { primary: '#123456' } });
    expect(palette.me.primary).toBe(DEFAULT_BOARD_PALETTE.me.primary);
    expect(palette.opponent.primary).toBe('#123456');
  });

  it('never throws on garbage and falls back to the defaults', () => {
    for (const garbage of [undefined, 0, 'nope', [], { me: 'gold' }, { me: { primary: 'rgb(1,2,3)' } }, { unknown: 1 }]) {
      const palette = resolveBoardPalette(garbage as unknown);
      expect(palette.me.primary).toBe('#c4a35a');
      expect(palette.opponent.primary).toBe('#b33e3e');
    }
  });

  it('always exposes a 6-digit hex so string-concatenated alpha stays valid CSS', () => {
    const palette = resolveBoardPalette({ me: { primary: '#fa0' } });
    expect(palette.me.primary).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette.me.bright).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('color helpers', () => {
  it('produces the rgb triple EdgeCoinFlip interpolates', () => {
    expect(hexToRgbTriple('#c4a35a')).toBe('196,163,90');
    expect(hexToRgbTriple('#b33e3e')).toBe('179,62,62');
  });

  it('builds rgba strings and clamps alpha', () => {
    expect(withAlpha('#c4a35a', 0.35)).toBe('rgba(196, 163, 90, 0.35)');
    expect(withAlpha('#c4a35a', 5)).toBe('rgba(196, 163, 90, 1)');
    expect(withAlpha('#c4a35a', -1)).toBe('rgba(196, 163, 90, 0)');
  });

  it('flags a near-black pick as low contrast on the board', () => {
    expect(isLowContrastOnBoard('#0b0b0b')).toBe(true);
    expect(isLowContrastOnBoard('#c4a35a')).toBe(false);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
  });

  it('picks a readable foreground for a fill', () => {
    expect(readableForegroundOn('#f0d890')).toBe('#0a0a0a');
    expect(readableForegroundOn('#101040')).toBe('#f5f5f5');
  });
});

describe('validateStoredBoardPalette', () => {
  it('accepts null as an explicit reset', () => {
    expect(validateStoredBoardPalette(null)).toEqual({ ok: true, value: null });
  });

  it('normalizes accepted values', () => {
    const result = validateStoredBoardPalette({ me: { primary: '#ABCDEF' }, opponent: { bright: '#0f0' } });
    expect(result).toEqual({ ok: true, value: { me: { primary: '#abcdef' }, opponent: { bright: '#00ff00' } } });
  });

  it('collapses an empty payload to null', () => {
    expect(validateStoredBoardPalette({})).toEqual({ ok: true, value: null });
    expect(validateStoredBoardPalette({ me: {} })).toEqual({ ok: true, value: null });
  });

  it('rejects unknown top-level keys', () => {
    expect(validateStoredBoardPalette({ me: { primary: '#ffffff' }, evil: 1 }).ok).toBe(false);
  });

  it('rejects unknown side keys', () => {
    expect(validateStoredBoardPalette({ me: { primary: '#ffffff', script: 'x' } }).ok).toBe(false);
  });

  it('rejects non-hex color values', () => {
    for (const bad of ['rgb(1,2,3)', 'rgba(1,2,3,0.5)', 'red', '#fff) ;x:y', '#c4a35aff', 'var(--x)']) {
      const result = validateStoredBoardPalette({ me: { primary: bad } });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('color');
    }
  });

  it('rejects arrays and primitives', () => {
    expect(validateStoredBoardPalette([]).ok).toBe(false);
    expect(validateStoredBoardPalette('gold').ok).toBe(false);
    expect(validateStoredBoardPalette(7).ok).toBe(false);
  });

  it('rejects an oversized payload', () => {
    const big = { me: { primary: '#ffffff'.padEnd(400, 'f') } };
    expect(validateStoredBoardPalette(big).ok).toBe(false);
  });
});

describe('isDefaultBoardPalette', () => {
  it('treats null and default-valued palettes as default', () => {
    expect(isDefaultBoardPalette(null)).toBe(true);
    expect(isDefaultBoardPalette({ me: { primary: '#c4a35a' } })).toBe(true);
  });

  it('detects a customised palette', () => {
    expect(isDefaultBoardPalette({ me: { primary: '#00ff00' } })).toBe(false);
  });
});
