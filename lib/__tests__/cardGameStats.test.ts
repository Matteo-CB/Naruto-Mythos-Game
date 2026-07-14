import { describe, it, expect } from 'vitest';
import { extractGameCounters, type GroupCounters } from '@/lib/cards/gameStatsCompute';
import { getCharacterById, getMissionById } from '@/lib/data/cardIndex';
import { usageGroupKey } from '@/lib/cards/usageLive';

const NARUTO_R = getCharacterById('KS-108-R')!;
const NARUTO_RA = getCharacterById('KS-108-RA')!;
const SAKURA = getCharacterById('KS-003-C')!;
const MISSION = getMissionById('KS-001-MMS')!;

const G_NARUTO = usageGroupKey(NARUTO_R);
const G_SAKURA = usageGroupKey(SAKURA);
const G_MISSION = usageGroupKey(MISSION);

function playLog(action: string, card: { name_fr: string; title_fr: string }) {
  return {
    turn: 1,
    phase: 'action',
    player: 'player1',
    action,
    details: 'x',
    messageParams: { card: card.name_fr, title: card.title_fr },
    timestamp: 1,
  } as never;
}

describe('extractGameCounters', () => {
  it('counts deck presence, wins, copies, plays, reveals and upgrades per group', () => {
    const counters = new Map<string, GroupCounters>();
    extractGameCounters(
      {
        initialState: {
          player1: {
            deck: [NARUTO_R, NARUTO_RA, SAKURA] as never,
            hand: [SAKURA] as never,
            missionCards: [MISSION] as never,
          },
          player2: {
            deck: [SAKURA] as never,
            hand: [],
          },
        },
        log: [
          playLog('PLAY_CHARACTER', NARUTO_R),
          playLog('REVEAL_CHARACTER', SAKURA),
          playLog('UPGRADE_CHARACTER', NARUTO_RA),
          playLog('PASS', SAKURA),
        ],
      },
      'player1',
      counters,
    );

    const naruto = counters.get(G_NARUTO)!;
    expect(naruto.gamesSeen).toBe(1);
    expect(naruto.gamesWon).toBe(1);
    expect(naruto.copiesSum).toBe(2);
    expect(naruto.copyDecks).toBe(1);
    expect(naruto.timesPlayed).toBe(2);
    expect(naruto.timesUpgraded).toBe(1);
    expect(naruto.timesRevealed).toBe(0);

    const sakura = counters.get(G_SAKURA)!;
    expect(sakura.gamesSeen).toBe(2);
    expect(sakura.gamesWon).toBe(1);
    expect(sakura.copiesSum).toBe(3);
    expect(sakura.copyDecks).toBe(2);
    expect(sakura.timesPlayed).toBe(1);
    expect(sakura.timesRevealed).toBe(1);

    const mission = counters.get(G_MISSION)!;
    expect(mission.gamesSeen).toBe(1);
    expect(mission.gamesWon).toBe(1);
  });

  it('handles draws and malformed payloads without counting wins', () => {
    const counters = new Map<string, GroupCounters>();
    extractGameCounters(
      { initialState: { player1: { deck: [SAKURA] as never, hand: [] } }, log: [] },
      null,
      counters,
    );
    const sakura = counters.get(G_SAKURA)!;
    expect(sakura.gamesSeen).toBe(1);
    expect(sakura.gamesWon).toBe(0);

    extractGameCounters({}, 'player1', counters);
    expect(counters.get(G_SAKURA)!.gamesSeen).toBe(1);
  });
});
