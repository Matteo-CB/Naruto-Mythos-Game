import { describe, it, expect } from 'vitest';
import { decideScanAction, REMOVE_THRESHOLDS, FLAG_THRESHOLDS } from '@/lib/moderation/autoScan';

describe('decideScanAction', () => {
  it('removes clear hate speech', () => {
    const d = decideScanAction({ hate: 0.95, harassment: 0.4 });
    expect(d.action).toBe('removed');
    expect(d.topCategory).toBe('hate');
    expect(d.topScore).toBe(0.95);
  });

  it('removes a real insult that used to slip through (sale fils de pute ~ 0.84)', () => {
    const d = decideScanAction({ harassment: 0.84, 'harassment/threatening': 0.0, hate: 0.01 });
    expect(d.action).toBe('removed');
    expect(d.topCategory).toBe('harassment');
  });

  it('removes a racist line via the hate axis (nigger ~ hate 0.57)', () => {
    const d = decideScanAction({ hate: 0.57, harassment: 0.46 });
    expect(d.action).toBe('removed');
    expect(d.topCategory).toBe('hate');
  });

  it('removes threatening harassment above its lower threshold', () => {
    const d = decideScanAction({ 'harassment/threatening': 0.75 });
    expect(d.action).toBe('removed');
    expect(d.topCategory).toBe('harassment/threatening');
  });

  it('flags medium harassment without removing', () => {
    const d = decideScanAction({ harassment: 0.7 });
    expect(d.action).toBe('flagged');
    expect(d.topCategory).toBe('harassment');
  });

  it('lets benign trash-talk through', () => {
    const d = decideScanAction({ harassment: 0.3, hate: 0.05, violence: 0.2 });
    expect(d.action).toBe('none');
    expect(d.topCategory).toBe('harassment');
  });

  it('prefers the removal category with the strongest threshold ratio', () => {
    const d = decideScanAction({ hate: 0.82, 'hate/threatening': 0.72 });
    expect(d.action).toBe('removed');
    expect(d.topCategory).toBe('hate/threatening');
  });

  it('ignores unknown categories and non numeric values', () => {
    const d = decideScanAction({ weird_new_category: 0.99, hate: Number.NaN } as Record<string, number>);
    expect(d.action).toBe('none');
  });

  it('keeps every remove threshold at or above its flag threshold', () => {
    for (const [cat, removeAt] of Object.entries(REMOVE_THRESHOLDS)) {
      const flagAt = FLAG_THRESHOLDS[cat];
      if (flagAt !== undefined) {
        expect(removeAt).toBeGreaterThanOrEqual(flagAt);
      }
    }
  });
});
