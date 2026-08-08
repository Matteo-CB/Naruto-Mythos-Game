import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const FILE = readFileSync('components/game/MissionLane.tsx', 'utf8');
const START = FILE.indexOf('function MissionCardDisplay(');
const END = FILE.indexOf('function MissionSwapModal(');
const MISSION_CARD = FILE.slice(START, END);

function block(anchor: string, length = 460): string {
  const at = MISSION_CARD.indexOf(anchor);
  expect(at, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
  return MISSION_CARD.slice(at, at + length);
}

function zIndexOf(source: string): number {
  const match = source.match(/zIndex:\s*(\d+)/);
  return match ? Number(match[1]) : 0;
}

describe('what is drawn on a mission stays visible above its artwork', () => {
  const artwork = zIndexOf(block("imageRendering: 'crisp-edges'", 130));

  it('the mission card section was found', () => {
    expect(START).toBeGreaterThan(-1);
    expect(END).toBeGreaterThan(START);
  });

  it('the artwork carries its own layer, above the attachment strips', () => {
    expect(artwork).toBeGreaterThan(0);
  });

  it('the rank badge is drawn above the artwork', () => {
    const badge = block('className="absolute top-1 left-1 px-1.5 py-0.5 font-bold"');
    expect(zIndexOf(badge), 'the rank letter must not slip under the art').toBeGreaterThan(artwork);
  });

  it('the mission points badge is drawn above the artwork', () => {
    const badge = block('className="absolute top-1 right-1 px-1 py-0.5 font-bold tabular-nums"');
    expect(zIndexOf(badge), 'how much the mission is worth must stay readable').toBeGreaterThan(artwork);
  });

  it('the won or lost banner is drawn above the artwork', () => {
    const banner = block('className="absolute inset-0 flex items-center justify-center"');
    expect(zIndexOf(banner)).toBeGreaterThan(artwork);
  });

  it('the mission still prints its total value', () => {
    expect(MISSION_CARD).toContain("{totalPoints} {t('game.board.pts')}");
    expect(FILE).toContain('const totalPoints = mission.basePoints + mission.rankBonus;');
  });
});
