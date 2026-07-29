import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { isLandscapeCard, cardAspectRatio } from '@/lib/cards/orientation';
import { portraitImagePath } from '@/lib/utils/imagePath';
import { getPlayableAttachments } from '@/lib/data/cardLoader';
import type { CardData } from '@/lib/engine/types';

const ROOTS = ['components', 'app'];

const ALLOWED_RAW_PATHS = new Set<string>([
  'app/[locale]/worldcup/page.tsx',
  'app/[locale]/cards/[slug]/page.tsx',
  'components/cards/MissionCard.tsx',
  'components/game/MissionLane.tsx',
  'components/boosters/BoosterRatesPanel.tsx',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.tsx')) out.push(full.replace(/\\/g, '/'));
  }
  return out;
}

describe('a mission attachment is never squeezed into a portrait slot un-rotated', () => {
  it('the rotated art exists for every mission attachment', () => {
    const missionAttachments = getPlayableAttachments().filter((a) => a.attach_to === 'mission');
    expect(missionAttachments.length, 'the set ships mission attachments').toBeGreaterThan(0);

    for (const attachment of missionAttachments) {
      expect(isLandscapeCard(attachment as unknown as CardData)).toBe(true);
      expect(cardAspectRatio(attachment as unknown as CardData)).toBe('3.5 / 2.5');
      const rotated = portraitImagePath(attachment as unknown as CardData);
      expect(rotated, `${attachment.id} must resolve a rotated asset`).toBeTruthy();
      expect(rotated, `${attachment.id} must use the pre-rotated art`).toContain('-rot');
    }
  });

  it('every surface rendering card art is either rotation aware or orientation aware', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const source = readFileSync(file, 'utf8');
        if (!source.includes('normalizeImagePath(')) continue;
        if (source.includes('portraitImagePath')) continue;
        if (/cardAspectRatio|isLandscapeCard|LANDSCAPE_ASPECT/.test(source)) continue;
        if (ALLOWED_RAW_PATHS.has(file)) continue;
        offenders.push(file);
      }
    }
    expect(
      offenders,
      `these render card art without handling a landscape card:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
