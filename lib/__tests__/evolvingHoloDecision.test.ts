import { describe, it, expect } from 'vitest';
import { decideHolo } from '@/lib/evolving/holoDecision';

describe('Phase 3 — decideHolo (component logic)', () => {
  describe('active state', () => {
    it('activates for valid compatible deck (0pt)', () => {
      const d = decideHolo({ points: 0 });
      expect(d.active).toBe(true);
      expect(d.bracket).toBe(0);
      expect(d.color).toBe('#e8e8f0');
    });

    it('activates for valid compatible deck (3pt = gold bracket)', () => {
      const d = decideHolo({ points: 3 });
      expect(d.active).toBe(true);
      expect(d.bracket).toBe(3);
      expect(d.color).toBe('#c4a35a');
    });

    it('activates for max-budget deck (5pt = crimson)', () => {
      const d = decideHolo({ points: 5 });
      expect(d.active).toBe(true);
      expect(d.bracket).toBe(5);
      expect(d.color).toBe('#b33e3e');
    });
  });

  describe('inactive state', () => {
    it('does NOT activate for over-budget deck (6pt)', () => {
      const d = decideHolo({ points: 6 });
      expect(d.active).toBe(false);
      expect(d.color).toBeNull();
      expect(d.bracket).toBeNull();
    });

    it('does NOT activate for negative points', () => {
      const d = decideHolo({ points: -1 });
      expect(d.active).toBe(false);
    });

    it('does NOT activate for NaN', () => {
      const d = decideHolo({ points: NaN });
      expect(d.active).toBe(false);
    });

    it('does NOT activate for Infinity', () => {
      const d = decideHolo({ points: Infinity });
      expect(d.active).toBe(false);
    });

    it('does NOT activate when enabled is explicitly false', () => {
      const d = decideHolo({ points: 3, enabled: false });
      expect(d.active).toBe(false);
    });

    it('DOES activate when enabled is undefined (default ON for compatible deck)', () => {
      const d = decideHolo({ points: 2, enabled: undefined });
      expect(d.active).toBe(true);
    });

    it('DOES activate when enabled is true', () => {
      const d = decideHolo({ points: 4, enabled: true });
      expect(d.active).toBe(true);
    });
  });

  describe('intensity class', () => {
    it('defaults to "normal" intensity', () => {
      expect(decideHolo({ points: 3 }).intensityClass).toBe('holo-evolving--normal');
    });

    it('emits "subtle" class', () => {
      expect(decideHolo({ points: 3, intensity: 'subtle' }).intensityClass).toBe('holo-evolving--subtle');
    });

    it('emits "strong" class', () => {
      expect(decideHolo({ points: 3, intensity: 'strong' }).intensityClass).toBe('holo-evolving--strong');
    });

    it('intensityClass is empty when inactive', () => {
      expect(decideHolo({ points: 6 }).intensityClass).toBe('');
      expect(decideHolo({ points: 3, enabled: false }).intensityClass).toBe('');
    });
  });

  describe('zero pulse (special treatment for 0pt decks)', () => {
    it('triggers zeroPulse for 0pt deck', () => {
      expect(decideHolo({ points: 0 }).zeroPulse).toBe(true);
    });

    it('does NOT trigger zeroPulse for 1pt+ decks', () => {
      expect(decideHolo({ points: 1 }).zeroPulse).toBe(false);
      expect(decideHolo({ points: 3 }).zeroPulse).toBe(false);
      expect(decideHolo({ points: 5 }).zeroPulse).toBe(false);
    });

    it('does NOT trigger zeroPulse when inactive', () => {
      expect(decideHolo({ points: 6 }).zeroPulse).toBe(false);
      expect(decideHolo({ points: 0, enabled: false }).zeroPulse).toBe(false);
    });
  });

  describe('full palette coverage', () => {
    it('matches palette for every bracket 0..5', () => {
      expect(decideHolo({ points: 0 }).color).toBe('#e8e8f0');
      expect(decideHolo({ points: 1 }).color).toBe('#5fb8d8');
      expect(decideHolo({ points: 2 }).color).toBe('#9070d0');
      expect(decideHolo({ points: 3 }).color).toBe('#c4a35a');
      expect(decideHolo({ points: 4 }).color).toBe('#e08040');
      expect(decideHolo({ points: 5 }).color).toBe('#b33e3e');
    });
  });
});
