import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GameAction, GameState, PlayerID, VisibleGameState, CardData, CharacterCard } from '@/lib/engine/types';

import {
  BATTLEPASS_TIER_COUNT,
  BATTLEPASS_XP_PER_TIER,
  BATTLEPASS_MAX_NAMED_XP,
  BATTLEPASS_INFINITE_STEP_XP,
  QUEST_XP_BY_LEVEL,
  TOURNAMENT_WIN_FALLBACK_XP,
  getTierReward,
} from '@/lib/battlepass/constants';
import {
  computeTierState,
  tierForXp,
  xpRequiredForTier,
  tiersCrossed,
  infiniteBoostersDelta,
  infiniteBoostersTotalForXp,
} from '@/lib/battlepass/computeTier';
import { computePostFiftyAward } from '@/lib/battlepass/postFiftyRewards';
import { computeClaimable } from '@/lib/battlepass/claimRewards';

import { QUESTS, getQuestsByLevel } from '@/lib/quests/questData';
import { isQuestAllowedInMode, matchQuestsForEvent } from '@/lib/quests/trackProgress';
import { pickDailyQuest, formatDateUTC } from '@/lib/quests/dailySelector';

import {
  VARIANT_PACK_SIZE,
  VARIANT_PACK_PROBABILITIES,
  VARIANT_RARITY_ROLL_ORDER,
  BOOSTER_EXCLUDED_VARIANTS,
  TOURNAMENT_PRIZE_CARD_IDS,
  BATTLEPASS_TIER_5_CARD,
  BATTLEPASS_TIER_25_CARD,
  BATTLEPASS_TIER_50_CARD,
  DUPLICATE_XP_BY_RARITY,
  isVariantRarity,
} from '@/lib/variants/constants';
import { rollVariantBooster } from '@/lib/variants/rollBooster';
import {
  eligibleVariantsForSet,
  eligibleVariantsForSetByRarity,
  clearVariantPoolCache,
} from '@/lib/variants/variantPool';
import { isBoosterObtainableVariant, getVariantObtentionMode } from '@/lib/variants/obtention';
import { mulberry32, type Rng } from '@/lib/variants/rng';
import {
  holoIdFor,
  holoBaseId,
  isHoloId,
  decorateHoloCard,
  normalizeHoloCardForGame,
  holoDuplicateXp,
} from '@/lib/holo/holoId';

import { GameEngine } from '@/lib/engine/GameEngine';
import { resetIdCounter } from '@/lib/engine/utils/id';
import { compressReplay, decompressReplay, getReplayPayload } from '@/lib/db/replayCompression';

import { isCardPublicSync } from '@/lib/cards/reveal';
import { sanitizeUnrevealedForViewer, stateHasUnrevealed } from '@/lib/socket/sanitizeUnrevealed';
import { applySetStatusOverrides } from '@/lib/data/sets/registry';
import { getCardById } from '@/lib/data/cardIndex';

import { createActionPhaseState } from './testHelpers';

const dbMocks = vi.hoisted(() => ({
  deckFindUnique: vi.fn(),
  hiddenCardFindMany: vi.fn(),
  postCreate: vi.fn(),
  userFindUnique: vi.fn(),
  siteSettingsFindUnique: vi.fn(),
  auth: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    deck: { findUnique: (...a: unknown[]) => dbMocks.deckFindUnique(...a) },
    hiddenCard: { findMany: (...a: unknown[]) => dbMocks.hiddenCardFindMany(...a) },
    post: { create: (...a: unknown[]) => dbMocks.postCreate(...a) },
    user: { findUnique: (...a: unknown[]) => dbMocks.userFindUnique(...a) },
    siteSettings: { findUnique: (...a: unknown[]) => dbMocks.siteSettingsFindUnique(...a) },
  },
}));

vi.mock('@/lib/auth/authOptions', () => ({
  auth: (...a: unknown[]) => dbMocks.auth(...a),
}));

import { createPost } from '@/lib/social/posts';
import { invalidateRevealCache } from '@/lib/cards/reveal';
import { GET as revealingCardsRoute } from '@/app/api/cards/revealing/route';
import { reloadSetConfig } from '@/lib/data/setConfigServer';

function scriptedRng(values: number[]): Rng {
  let i = 0;
  return {
    next(): number {
      const v = values[i % values.length];
      i++;
      return v;
    },
  };
}

describe('battlepass tier maths: 200 XP per tier, 50 named tiers, infinite 500 XP tail', () => {
  it('pins the documented constants', () => {
    expect(BATTLEPASS_XP_PER_TIER).toBe(200);
    expect(BATTLEPASS_TIER_COUNT).toBe(50);
    expect(BATTLEPASS_MAX_NAMED_XP).toBe(10000);
    expect(BATTLEPASS_INFINITE_STEP_XP).toBe(500);
  });

  it('tier N requires exactly 200 times N cumulative XP, on both sides of every boundary', () => {
    for (let t = 1; t <= BATTLEPASS_TIER_COUNT; t++) {
      const need = t * BATTLEPASS_XP_PER_TIER;
      expect(xpRequiredForTier(t)).toBe(need);
      expect(tierForXp(need)).toBe(t);
      expect(tierForXp(need - 1)).toBe(t - 1);
    }
  });

  it('clamps the named track at tier 50 and never returns tier 51', () => {
    expect(xpRequiredForTier(51)).toBe(BATTLEPASS_MAX_NAMED_XP);
    expect(tierForXp(BATTLEPASS_MAX_NAMED_XP + 999999)).toBe(BATTLEPASS_TIER_COUNT);
    const crossed = tiersCrossed(0, BATTLEPASS_MAX_NAMED_XP + 12345);
    expect(crossed).toHaveLength(BATTLEPASS_TIER_COUNT);
    expect(crossed[0]).toBe(1);
    expect(crossed[crossed.length - 1]).toBe(BATTLEPASS_TIER_COUNT);
    expect(crossed).not.toContain(51);
  });

  it('treats negative and fractional XP as a floored non-negative amount', () => {
    expect(tierForXp(-1)).toBe(0);
    expect(computeTierState(-5000).xp).toBe(0);
    expect(computeTierState(-5000).tier).toBe(0);
    expect(computeTierState(250.9).xp).toBe(250);
    expect(computeTierState(250.9).tier).toBe(1);
    expect(computeTierState(199.999).tier).toBe(0);
  });

  it('gives one variant booster per additional 500 XP past 10000, at the exact boundaries', () => {
    expect(infiniteBoostersTotalForXp(BATTLEPASS_MAX_NAMED_XP - 1)).toBe(0);
    expect(infiniteBoostersTotalForXp(BATTLEPASS_MAX_NAMED_XP)).toBe(0);
    expect(infiniteBoostersTotalForXp(BATTLEPASS_MAX_NAMED_XP + 499)).toBe(0);
    expect(infiniteBoostersTotalForXp(BATTLEPASS_MAX_NAMED_XP + 500)).toBe(1);
    expect(infiniteBoostersTotalForXp(BATTLEPASS_MAX_NAMED_XP + 999)).toBe(1);
    expect(infiniteBoostersTotalForXp(BATTLEPASS_MAX_NAMED_XP + 1000)).toBe(2);
    expect(infiniteBoostersTotalForXp(BATTLEPASS_MAX_NAMED_XP + 10000)).toBe(20);
  });

  it('never resets the infinite counter: chunked awards sum to the single-shot total', () => {
    let xp = 0;
    let granted = 0;
    const chunks = [4000, 4000, 1999, 1, 500, 250, 250, 499, 1, 7777];
    for (const c of chunks) {
      const award = computePostFiftyAward(xp, xp + c);
      granted += award.newBoosters;
      xp += c;
      expect(award.totalBoostersAfter).toBe(granted);
    }
    expect(xp).toBe(19277);
    expect(granted).toBe(infiniteBoostersTotalForXp(19277));
    expect(granted).toBe(Math.floor((19277 - BATTLEPASS_MAX_NAMED_XP) / BATTLEPASS_INFINITE_STEP_XP));
    expect(infiniteBoostersDelta(19277, 19277)).toBe(0);
  });

  it('reports the remaining XP to the next infinite booster only past tier 50', () => {
    const below = computeTierState(BATTLEPASS_MAX_NAMED_XP - 1);
    expect(below.xpToNextInfiniteBooster).toBeNull();
    expect(below.isMaxNamedTier).toBe(false);
    const at = computeTierState(BATTLEPASS_MAX_NAMED_XP);
    expect(at.xpToNextInfiniteBooster).toBe(BATTLEPASS_INFINITE_STEP_XP);
    const mid = computeTierState(BATTLEPASS_MAX_NAMED_XP + 300);
    expect(mid.xpIntoCurrentInfiniteStep).toBe(300);
    expect(mid.xpToNextInfiniteBooster).toBe(200);
  });

  it('maps tier rewards to the three reserved cards and a booster everywhere else', () => {
    expect(getTierReward(5)).toEqual({ type: 'card', setId: 'KS', cardId: BATTLEPASS_TIER_5_CARD });
    expect(getTierReward(25)).toEqual({ type: 'card', setId: 'KS', cardId: BATTLEPASS_TIER_25_CARD });
    expect(getTierReward(50)).toEqual({ type: 'card', setId: 'KS', cardId: BATTLEPASS_TIER_50_CARD });
    let boosters = 0;
    for (let t = 1; t <= BATTLEPASS_TIER_COUNT; t++) {
      if (t === 5 || t === 25 || t === 50) continue;
      expect(getTierReward(t)).toEqual({ type: 'booster', setId: 'KS' });
      boosters++;
    }
    expect(boosters).toBe(47);
  });

  it('a fully completed named track claims 47 boosters and the 3 reserved cards', () => {
    const summary = computeClaimable(BATTLEPASS_MAX_NAMED_XP, []);
    expect(summary.unclaimedTiers).toHaveLength(BATTLEPASS_TIER_COUNT);
    expect(summary.totalBoosters).toBe(47);
    expect(summary.totalCards).toEqual([
      BATTLEPASS_TIER_5_CARD,
      BATTLEPASS_TIER_25_CARD,
      BATTLEPASS_TIER_50_CARD,
    ]);
    const beyond = computeClaimable(BATTLEPASS_MAX_NAMED_XP + 9999, []);
    expect(beyond.unclaimedTiers[beyond.unclaimedTiers.length - 1]).toBe(BATTLEPASS_TIER_COUNT);
  });
});

describe('quest XP by difficulty', () => {
  it('rewards 25 / 60 / 120 / 200 XP for levels 1 to 4', () => {
    expect(QUEST_XP_BY_LEVEL[1]).toBe(25);
    expect(QUEST_XP_BY_LEVEL[2]).toBe(60);
    expect(QUEST_XP_BY_LEVEL[3]).toBe(120);
    expect(QUEST_XP_BY_LEVEL[4]).toBe(200);
    expect(TOURNAMENT_WIN_FALLBACK_XP).toBe(200);
  });

  it('gives every catalogue quest a known difficulty, a positive target and a hook', () => {
    expect(QUESTS.length).toBeGreaterThan(100);
    for (const q of QUESTS) {
      expect([1, 2, 3, 4]).toContain(q.level);
      expect(QUEST_XP_BY_LEVEL[q.level]).toBeGreaterThan(0);
      expect(q.target).toBeGreaterThan(0);
      expect(q.hook.length).toBeGreaterThan(0);
      expect(['match', 'session', 'cumulative']).toContain(q.scope);
    }
    const ids = QUESTS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    const byLevelTotal = [1, 2, 3, 4].reduce((sum, lvl) => sum + getQuestsByLevel(lvl as 1).length, 0);
    expect(byLevelTotal).toBe(QUESTS.length);
  });

  it('a level 4 quest is worth exactly one fiftieth of the named battlepass track', () => {
    expect(BATTLEPASS_MAX_NAMED_XP / QUEST_XP_BY_LEVEL[4]).toBe(50);
    expect(QUEST_XP_BY_LEVEL[4]).toBe(BATTLEPASS_XP_PER_TIER);
  });
});

describe('Solo v Self never progresses a quest', () => {
  it('has zero quest opting in with allowSoloVSelf today', () => {
    expect(QUESTS.filter((q) => q.allowSoloVSelf === true)).toHaveLength(0);
  });

  it('blocks every quest in solo_v_self and allows every other mode', () => {
    for (const q of QUESTS) {
      expect(isQuestAllowedInMode(q, 'solo_v_self')).toBe(false);
    }
    const sample = QUESTS[0];
    for (const mode of ['ranked', 'casual', 'evolving', 'sealed', 'tournament', 'ai', 'hotseat'] as const) {
      expect(isQuestAllowedInMode(sample, mode)).toBe(true);
    }
    expect(isQuestAllowedInMode(sample, undefined)).toBe(true);
  });

  it('matchQuestsForEvent returns nothing for a solo_v_self payload but matches in ranked', () => {
    const hook = 'character.played';
    expect(matchQuestsForEvent(hook, { gameMode: 'ranked' }).length).toBeGreaterThan(0);
    expect(matchQuestsForEvent(hook, { gameMode: 'solo_v_self' })).toEqual([]);
    expect(matchQuestsForEvent(hook, { gameMode: 'solo_v_self', delta: 99 })).toEqual([]);
  });

  it('honours delta, equality predicates and threshold predicates', () => {
    const plain = matchQuestsForEvent('character.played', { gameMode: 'casual', delta: 3 });
    expect(plain.every((m) => m.delta === 3)).toBe(true);
    const zero = matchQuestsForEvent('character.played', { gameMode: 'casual', delta: 0 });
    expect(zero.every((m) => m.delta === 1)).toBe(true);

    const sound = matchQuestsForEvent('character.played.group', { group: 'Sound Village' });
    expect(sound.length).toBeGreaterThan(0);
    expect(sound.every((m) => m.quest.predicate?.group === 'Sound Village')).toBe(true);
    const nonsense = matchQuestsForEvent('character.played.group', { group: 'Nowhere Village' });
    expect(nonsense).toEqual([]);
    expect(matchQuestsForEvent('character.played.group', undefined)).toEqual([]);
  });
});

describe('daily quest selection is deterministic and never picks an excluded quest', () => {
  it('returns the same quest for the same UTC date and is stable across calls', () => {
    const date = formatDateUTC(new Date(Date.UTC(2026, 6, 25)));
    expect(date).toBe('2026-07-25');
    const a = pickDailyQuest(date);
    const b = pickDailyQuest(date);
    expect(a.id).toBe(b.id);
    expect(QUESTS.some((q) => q.id === a.id)).toBe(true);
  });

  it('never draws a cumulative grind quest or a meta hook over a full year of dates', () => {
    const banned = new Set(['daily_quest.completed', 'battlepass.tier.reached', 'elo.tier.reached']);
    const bannedIds = new Set(['discard-200', 'defeat-100-cumulative', 'trade-cards-10', 'ranked-wins-50']);
    for (let d = 0; d < 366; d++) {
      const date = formatDateUTC(new Date(Date.UTC(2026, 0, 1 + d)));
      const q = pickDailyQuest(date);
      expect(banned.has(q.hook)).toBe(false);
      expect(bannedIds.has(q.id)).toBe(false);
    }
  });

  it('skips recently used quests but still returns one when everything is recent', () => {
    const date = '2026-07-25';
    const first = pickDailyQuest(date);
    const second = pickDailyQuest(date, [first.id]);
    expect(second.id).not.toBe(first.id);
    const fallback = pickDailyQuest(date, QUESTS.map((q) => q.id));
    expect(fallback).toBeTruthy();
    expect(QUESTS.some((q) => q.id === fallback.id)).toBe(true);
  });
});

describe('variant booster composition and reserved-card exclusion', () => {
  beforeEach(() => {
    clearVariantPoolCache();
  });

  it('rolls a fixed number of independent slots and its probability table sums to 1', () => {
    expect(VARIANT_PACK_SIZE).toBe(8);
    const sum = Object.values(VARIANT_PACK_PROBABILITIES).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(VARIANT_PACK_PROBABILITIES.L).toBeCloseTo(1 / 200, 12);
    expect(VARIANT_PACK_PROBABILITIES.SV).toBeCloseTo(1 / 1000, 12);
    expect(VARIANT_PACK_PROBABILITIES.MV).toBeCloseTo(1 / 35, 12);
    expect(VARIANT_PACK_PROBABILITIES.RA).toBeGreaterThan(0);
    expect(new Set(VARIANT_RARITY_ROLL_ORDER).size).toBe(VARIANT_RARITY_ROLL_ORDER.length);
  });

  it('always returns exactly VARIANT_PACK_SIZE cards', () => {
    for (let seed = 0; seed < 60; seed++) {
      const pack = rollVariantBooster('KS', { rng: mulberry32(seed) });
      expect(pack).toHaveLength(VARIANT_PACK_SIZE);
      for (const card of pack) {
        expect(card.cardId).toBeTruthy();
        expect(card.set).toBe('KS');
      }
    }
  });

  it('maps each slot roll to the documented rarity band, boundary by boundary', () => {
    const rng = scriptedRng([
      0.0009, 0,
      0.001, 0,
      0.006, 0,
      0.19, 0,
      0.2, 0,
      0.45, 0,
      0.0345, 0,
      0.99999, 0,
    ]);
    const pack = rollVariantBooster('KS', { rng });
    expect(pack[0].rarity).toBe('SV');
    expect(pack[1].rarity).toBe('L');
    expect(pack[2].rarity).toBe('MV');
    expect(pack[3].rarity).toBe('RA');
    expect(pack[4].isHolo).toBe(true);
    expect(pack[4].rarity).toBe('UC');
    expect(pack[5].isHolo).toBe(true);
    expect(pack[5].rarity).toBe('C');
    expect(pack[6].rarity).toBe('MV');
    expect(pack[7].isHolo).toBe(true);
    expect(pack[7].rarity).toBe('C');
  });

  it('forces only the first slot in the admin simulator modes', () => {
    const forcedL = rollVariantBooster('KS', { rng: mulberry32(7), mode: 'forceL' });
    expect(forcedL[0].rarity).toBe('L');
    expect(forcedL).toHaveLength(VARIANT_PACK_SIZE);
    const forcedSV = rollVariantBooster('KS', { rng: mulberry32(7), mode: 'forceSV' });
    expect(forcedSV[0].rarity).toBe('SV');
    const tail = forcedL.slice(1).map((c) => c.rarity);
    expect(tail.every((r) => r === 'L')).toBe(false);
  });

  it('never rolls a reserved card across many thousands of slots', () => {
    let slots = 0;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 1500; seed++) {
      const pack = rollVariantBooster('KS', { rng: mulberry32(seed * 7919) });
      for (const card of pack) {
        slots++;
        seen.add(card.cardId);
        expect(BOOSTER_EXCLUDED_VARIANTS.has(card.cardId)).toBe(false);
        expect(BOOSTER_EXCLUDED_VARIANTS.has(holoBaseId(card.cardId))).toBe(false);
      }
    }
    expect(slots).toBe(1500 * VARIANT_PACK_SIZE);
    expect(seen.size).toBeGreaterThan(20);
  });

  it('keeps every reserved card out of the eligible pools and marks it reserved', () => {
    const pool = eligibleVariantsForSet('KS').map((c) => c.cardId);
    const byRarity = eligibleVariantsForSetByRarity('KS');
    for (const id of BOOSTER_EXCLUDED_VARIANTS) {
      expect(getCardById(id)).toBeTruthy();
      expect(pool).not.toContain(id);
      expect(isBoosterObtainableVariant(id)).toBe(false);
      expect(getVariantObtentionMode(id)).toBe('reserved');
    }
    for (const rarity of ['RA', 'MV', 'SV', 'L'] as const) {
      for (const card of byRarity[rarity]) {
        expect(card.rarity).toBe(rarity);
        expect(BOOSTER_EXCLUDED_VARIANTS.has(card.cardId)).toBe(false);
      }
    }
    expect(byRarity.RA.length).toBeGreaterThan(0);
    expect(byRarity.MV.length).toBeGreaterThan(0);
  });

  it('reserves the 4 tournament promos and the 3 battlepass cards', () => {
    for (const id of TOURNAMENT_PRIZE_CARD_IDS) {
      expect(BOOSTER_EXCLUDED_VARIANTS.has(id)).toBe(true);
    }
    for (const id of [BATTLEPASS_TIER_5_CARD, BATTLEPASS_TIER_25_CARD, BATTLEPASS_TIER_50_CARD]) {
      expect(BOOSTER_EXCLUDED_VARIANTS.has(id)).toBe(true);
    }
    expect(TOURNAMENT_PRIZE_CARD_IDS).not.toContain(BATTLEPASS_TIER_25_CARD);
  });
});

describe('duplicate XP conversion', () => {
  it('converts a duplicate variant at 10 / 50 / 200 / 1000 XP', () => {
    expect(DUPLICATE_XP_BY_RARITY.RA).toBe(10);
    expect(DUPLICATE_XP_BY_RARITY.MV).toBe(50);
    expect(DUPLICATE_XP_BY_RARITY.SV).toBe(200);
    expect(DUPLICATE_XP_BY_RARITY.L).toBe(1000);
  });

  it('converts a duplicate holo skin at 3 XP for a common and 5 XP for an uncommon', () => {
    expect(holoDuplicateXp('C')).toBe(3);
    expect(holoDuplicateXp('UC')).toBe(5);
    expect(holoDuplicateXp('R')).toBe(0);
    expect(holoDuplicateXp('MV')).toBe(0);
  });

  it('a legendary duplicate alone is worth 5 battlepass tiers', () => {
    expect(DUPLICATE_XP_BY_RARITY.L / BATTLEPASS_XP_PER_TIER).toBe(5);
    expect(tiersCrossed(0, DUPLICATE_XP_BY_RARITY.L)).toEqual([1, 2, 3, 4, 5]);
    expect(isVariantRarity('L')).toBe(true);
    expect(isVariantRarity('C')).toBe(false);
    expect(isVariantRarity(undefined)).toBe(false);
  });
});

describe('holo ids stay in the inventory and never reach the engine', () => {
  it('round-trips the _H suffix idempotently', () => {
    expect(holoIdFor('KS-001-C')).toBe('KS-001-C_H');
    expect(holoIdFor('KS-001-C_H')).toBe('KS-001-C_H');
    expect(holoBaseId('KS-001-C_H')).toBe('KS-001-C');
    expect(holoBaseId('KS-001-C')).toBe('KS-001-C');
    expect(isHoloId('KS-001-C_H')).toBe(true);
    expect(isHoloId('KS-001-C')).toBe(false);
    expect(isHoloId(null)).toBe(false);
  });

  it('decorates for the inventory but normalizes back to the base id for play', () => {
    const base = getCardById('KS-001-C') as CardData;
    expect(base).toBeTruthy();
    const holo = decorateHoloCard(base);
    expect(holo.cardId).toBe('KS-001-C_H');
    expect(holo.id).toBe('KS-001-C_H');
    expect(holo.isHolo).toBe(true);
    const inGame = normalizeHoloCardForGame(holo);
    expect(inGame.id).toBe('KS-001-C');
    expect(inGame.cardId).toBe('KS-001-C');
    expect(inGame.isHolo).toBe(true);
    expect(normalizeHoloCardForGame(base).cardId).toBe(base.cardId);
  });
});

function normalizeState(state: GameState): unknown {
  const clone = JSON.parse(JSON.stringify(state)) as GameState;
  clone.log = clone.log.map((entry) => ({ ...entry, timestamp: 0 }));
  return clone;
}

function runScript(
  initial: GameState,
  script: Array<{ player: PlayerID; action: GameAction }>,
): GameState {
  let state = JSON.parse(JSON.stringify(initial)) as GameState;
  for (const step of script) {
    state = GameEngine.applyAction(state, step.player, step.action);
  }
  return state;
}

describe('replays are deterministic: the stored history rebuilds the stored final state', () => {
  const script: Array<{ player: PlayerID; action: GameAction }> = [
    { player: 'player1', action: { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false } },
    { player: 'player2', action: { type: 'PLAY_HIDDEN', cardIndex: 1, missionIndex: 0 } },
    { player: 'player1', action: { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false } },
    { player: 'player2', action: { type: 'PASS' } },
    { player: 'player1', action: { type: 'PASS' } },
  ];

  it('does not mutate the state it is given (pure engine)', () => {
    resetIdCounter();
    const state = createActionPhaseState();
    const snapshot = JSON.parse(JSON.stringify(state));
    const next = GameEngine.applyAction(state, 'player1', script[0].action);
    expect(next).not.toBe(state);
    expect(JSON.parse(JSON.stringify(state))).toEqual(snapshot);
    expect(next.activeMissions[0].player1Characters).toHaveLength(1);
  });

  it('records exactly one action history entry per applied action, in order', () => {
    resetIdCounter();
    const initial = createActionPhaseState();
    const final = runScript(initial, script);
    const history = final.actionHistory ?? [];
    expect(history).toHaveLength(script.length);
    history.forEach((entry, i) => {
      expect(entry.player).toBe(script[i].player);
      expect(entry.action).toEqual(script[i].action);
    });
  });

  it('replays the recorded history from the initial snapshot into an identical final state', () => {
    resetIdCounter();
    const initial = createActionPhaseState();
    const stored = JSON.parse(JSON.stringify(initial)) as GameState;
    const live = runScript(initial, script);

    const history = (live.actionHistory ?? []).map((h) => ({ player: h.player, action: h.action }));
    resetIdCounter();
    const replayed = runScript(stored, history);

    expect(normalizeState(replayed)).toEqual(normalizeState(live));
    expect(replayed.player1.missionPoints).toBe(live.player1.missionPoints);
    expect(replayed.player2.missionPoints).toBe(live.player2.missionPoints);
    expect(replayed.turn).toBe(live.turn);
    expect(replayed.edgeHolder).toBe(live.edgeHolder);
    expect(replayed.log.length).toBe(live.log.length);
  });

  it('is reproducible twice in a row and consumes no ambient randomness', () => {
    resetIdCounter();
    const initial = createActionPhaseState();
    const stored = JSON.parse(JSON.stringify(initial)) as GameState;

    const randomSpy = vi.spyOn(Math, 'random');
    resetIdCounter();
    const first = runScript(stored, script);
    resetIdCounter();
    const second = runScript(stored, script);
    const calls = randomSpy.mock.calls.length;
    randomSpy.mockRestore();

    expect(calls).toBe(0);
    expect(normalizeState(second)).toEqual(normalizeState(first));
  });

  it('replays a kept mulligan exactly (no reshuffle, no RNG)', () => {
    resetIdCounter();
    const initial = createActionPhaseState({
      phase: 'mulligan',
    });
    initial.player1.hasMulliganed = false;
    initial.player2.hasMulliganed = false;
    const stored = JSON.parse(JSON.stringify(initial)) as GameState;

    const keepScript: Array<{ player: PlayerID; action: GameAction }> = [
      { player: 'player1', action: { type: 'MULLIGAN', doMulligan: false } },
      { player: 'player2', action: { type: 'MULLIGAN', doMulligan: false } },
    ];

    const randomSpy = vi.spyOn(Math, 'random');
    const live = runScript(stored, keepScript);
    const replayed = runScript(stored, keepScript);
    const calls = randomSpy.mock.calls.length;
    randomSpy.mockRestore();

    expect(calls).toBe(0);
    expect(live.player1.hand.slice(0, 5).map((c) => c.id)).toEqual(
      stored.player1.hand.map((c) => c.id),
    );
    expect(live.phase).toBe('action');
    expect(normalizeState(replayed)).toEqual(normalizeState(live));
  });

  it('a taken mulligan reshuffles from ambient RNG, so the same history yields two different hands', () => {
    resetIdCounter();
    const initial = createActionPhaseState({ phase: 'mulligan' });
    initial.player1.hasMulliganed = false;
    initial.player2.hasMulliganed = false;
    const stored = JSON.parse(JSON.stringify(initial)) as GameState;

    const mulliganScript: Array<{ player: PlayerID; action: GameAction }> = [
      { player: 'player1', action: { type: 'MULLIGAN', doMulligan: true } },
    ];

    const liveRng = mulberry32(11);
    const spyA = vi.spyOn(Math, 'random').mockImplementation(() => liveRng.next());
    const live = runScript(stored, mulliganScript);
    spyA.mockRestore();

    const replayRng = mulberry32(999);
    const spyB = vi.spyOn(Math, 'random').mockImplementation(() => replayRng.next());
    const replayed = runScript(stored, mulliganScript);
    spyB.mockRestore();

    expect(live.player1.hand).toHaveLength(5);
    expect(replayed.player1.hand).toHaveLength(5);
    expect(replayed.player1.hand.map((c) => c.name_fr)).not.toEqual(live.player1.hand.map((c) => c.name_fr));
  });

  it('survives the gzip round-trip used to persist a replay', () => {
    resetIdCounter();
    const initial = createActionPhaseState();
    const stored = JSON.parse(JSON.stringify(initial)) as GameState;
    const live = runScript(initial, script);

    const payload = {
      log: live.log,
      initialState: stored,
      actionHistory: live.actionHistory ?? [],
      playerNames: { player1: 'Kutxyt', player2: 'Daiki0' },
    };
    const gz = compressReplay(payload);
    const restored = decompressReplay<typeof payload>(gz);
    expect(restored.actionHistory).toEqual(payload.actionHistory);
    expect(restored.initialState.player1.hand.map((c) => c.id)).toEqual(
      stored.player1.hand.map((c) => c.id),
    );

    resetIdCounter();
    const fromRestored = runScript(restored.initialState as GameState, restored.actionHistory);
    expect(normalizeState(fromRestored)).toEqual(normalizeState(live));

    expect(getReplayPayload({ gameState: null, gameStateGz: gz })).toEqual(restored);
    expect(getReplayPayload({ gameState: null, gameStateGz: null })).toBeNull();
  });
});

function visibleCharacter(card: CharacterCard, overrides: Record<string, unknown> = {}) {
  return {
    instanceId: 'inst_1',
    isHidden: false,
    wasRevealedAtLeastOnce: true,
    isOwn: false,
    card,
    topCard: card,
    powerTokens: 2,
    controlledBy: 'player2' as PlayerID,
    originalOwner: 'player2' as PlayerID,
    missionIndex: 0,
    stackSize: 1,
    effectivePower: 7,
    isLastPlayed: false,
    ...overrides,
  };
}

function visibleState(overrides: Partial<VisibleGameState> = {}): VisibleGameState {
  const base = createActionPhaseState();
  return {
    gameId: base.gameId,
    turn: base.turn,
    phase: base.phase,
    activePlayer: 'player1',
    edgeHolder: 'player1',
    firstPasser: null,
    myPlayer: 'player1',
    myState: base.player1,
    opponentState: {
      id: 'player2',
      handSize: 5,
      deckSize: 20,
      discardPileSize: 0,
      discardPile: [],
      chakra: 5,
      missionPoints: 0,
      hasPassed: false,
      charactersInPlay: 0,
    },
    activeMissions: base.activeMissions.map((m) => ({
      ...m,
      player1Characters: [],
      player2Characters: [],
    })),
    missionDeckSize: 2,
    log: [],
    pendingEffects: [],
    pendingActions: [],
    ...overrides,
  } as VisibleGameState;
}

describe('card reveal gating never exposes an unrevealed card', () => {
  beforeEach(() => {
    applySetStatusOverrides({ SS: 'revealing' });
  });
  afterEach(() => {
    applySetStatusOverrides({});
  });

  it('always treats a released-set card as public, even if wrongly flagged hidden', () => {
    const hidden = new Set(['KS-001-C', 'KS-133-MV']);
    expect(isCardPublicSync('KS-001-C', hidden)).toBe(true);
    expect(isCardPublicSync('KS-133-MV', hidden)).toBe(true);
    expect(isCardPublicSync('KS-001-C', new Set())).toBe(true);
  });

  it('hides exactly the flagged cards of a revealing set and shows the rest', () => {
    const hidden = new Set(['SS-121-R']);
    expect(isCardPublicSync('SS-121-R', hidden)).toBe(false);
    expect(isCardPublicSync('SS-134-R', hidden)).toBe(true);
    expect(isCardPublicSync('SS-121-R', new Set())).toBe(true);
  });

  it('reduces a holo id to its base before deciding visibility', () => {
    const hidden = new Set(['SS-121-R']);
    expect(isCardPublicSync('SS-121-R_H', hidden)).toBe(false);
    expect(isCardPublicSync('SS-134-R_H', hidden)).toBe(true);
  });

  it('never exposes a coming-soon set, revealed flag or not, and fails closed on unknown ids', () => {
    applySetStatusOverrides({ SS: 'coming_soon' });
    expect(isCardPublicSync('SS-121-R', new Set())).toBe(false);
    expect(isCardPublicSync('SS-134-R', new Set())).toBe(false);
    applySetStatusOverrides({});
    expect(isCardPublicSync('ZZ-999-C', new Set())).toBe(false);
    expect(isCardPublicSync('', new Set())).toBe(false);
  });

  it('detects an unrevealed card on the board and in the opponent discard pile', () => {
    const secret = getCardById('SS-121-R') as CharacterCard;
    const hidden = new Set(['SS-121-R']);
    const clean = visibleState();
    expect(stateHasUnrevealed(clean, hidden)).toBe(false);
    expect(stateHasUnrevealed(clean, new Set())).toBe(false);

    const onBoard = visibleState();
    onBoard.activeMissions[0].player2Characters = [visibleCharacter(secret)];
    expect(stateHasUnrevealed(onBoard, hidden)).toBe(true);
    expect(stateHasUnrevealed(onBoard, new Set())).toBe(false);

    const inDiscard = visibleState();
    inDiscard.opponentState.discardPile = [secret];
    expect(stateHasUnrevealed(inDiscard, hidden)).toBe(true);
  });

  it('masks an unrevealed board character down to a blank card back', () => {
    const secret = getCardById('SS-121-R') as CharacterCard;
    const hidden = new Set(['SS-121-R']);
    const state = visibleState();
    state.activeMissions[0].player2Characters = [visibleCharacter(secret)];
    state.opponentState.discardPile = [secret];

    const masked = sanitizeUnrevealedForViewer(state, hidden);
    const vc = masked.activeMissions[0].player2Characters[0];
    expect(vc.card).toBeUndefined();
    expect(vc.topCard).toBeUndefined();
    expect(vc.isHidden).toBe(true);
    expect(vc.wasRevealedAtLeastOnce).toBe(false);
    expect(vc.effectivePower).toBe(0);
    expect(vc.powerTokens).toBe(0);
    expect(vc.instanceId).toBe('inst_1');

    const discarded = masked.opponentState.discardPile[0];
    expect(discarded.cardId).toBe('__UNREVEALED__');
    expect(discarded.name_fr).toBe('');
    expect(discarded.effects).toEqual([]);
    expect(discarded.chakra).toBe(0);
    expect(discarded.power).toBe(0);
    expect(JSON.stringify(masked)).not.toMatch(/"SS-121-R"/);
    expect(JSON.stringify(masked)).not.toContain(secret.name_fr);
  });

  it('masks an unrevealed card sitting in a discard pile on the viewer side', () => {
    const secret = getCardById('SS-121-R') as CardData;
    const state = visibleState();
    state.myState = { ...state.myState, discardPile: [secret as never] };
    const masked = sanitizeUnrevealedForViewer(state, new Set(['SS-121-R']));
    expect(masked.myState.discardPile[0].cardId).toBe('__UNREVEALED__');
    expect(masked.myState.discardPile[0].name_fr).toBe('');
  });

  it('leaves a revealed card of the same set untouched', () => {
    const revealed = getCardById('SS-134-R') as CharacterCard;
    const state = visibleState();
    state.activeMissions[0].player2Characters = [visibleCharacter(revealed)];
    const masked = sanitizeUnrevealedForViewer(state, new Set(['SS-121-R']));
    expect(masked.activeMissions[0].player2Characters[0].card?.cardId).toBe('SS-134-R');
    expect(masked.activeMissions[0].player2Characters[0].effectivePower).toBe(7);
  });

  it('masks an unrevealed mission card in play', () => {
    const secret = getCardById('SS-121-R') as CardData;
    const state = visibleState();
    state.activeMissions[0] = { ...state.activeMissions[0], card: secret as never };
    expect(stateHasUnrevealed(state, new Set(['SS-121-R']))).toBe(true);
    const masked = sanitizeUnrevealedForViewer(state, new Set(['SS-121-R']));
    expect(masked.activeMissions[0].card.cardId).toBe('__UNREVEALED__');
    expect(masked.activeMissions[0].card.image_file).toBe('/images/card-back.webp');
  });
});

describe('the runtime card API never delivers an unrevealed card to a normal player', () => {

  beforeEach(async () => {
    dbMocks.hiddenCardFindMany.mockReset();
    dbMocks.siteSettingsFindUnique.mockReset();
    dbMocks.userFindUnique.mockReset();
    dbMocks.auth.mockReset();
    dbMocks.siteSettingsFindUnique.mockResolvedValue({ setStatusOverrides: { SS: 'revealing' } });
    invalidateRevealCache();
    await reloadSetConfig();
  });

  afterEach(async () => {
    dbMocks.siteSettingsFindUnique.mockResolvedValue(null);
    await reloadSetConfig();
    invalidateRevealCache();
  });

  it('withholds the card data, the effect text and the art path of a hidden card', async () => {
    dbMocks.auth.mockResolvedValue(null);
    dbMocks.hiddenCardFindMany.mockResolvedValue([{ cardId: 'SS-121-R' }]);

    const res = await revealingCardsRoute();
    const body = await res.json();

    expect(body.privileged).toBe(false);
    expect(body.unrevealedIds).toEqual([]);
    expect(Object.keys(body.cards)).not.toContain('SS-121-R');
    expect(Object.keys(body.cards)).toContain('SS-134-R');
    expect(Object.keys(body.cards)).not.toContain('SS-121-R');
    for (const map of Object.values(body.descriptions as Record<string, Record<string, string[]>>)) {
      expect(Object.keys(map)).not.toContain('SS-121-R');
    }
    expect(body.cards['SS-134-R'].image_file).toBe('/api/card-image/SS-134-R');
    expect(body.cards['SS-134-R'].image_url).toBe('');
  });

  it('delivers the hidden card only to an admin, flagged as unrevealed', async () => {
    dbMocks.auth.mockResolvedValue({ user: { id: 'admin1', name: 'Kutxyt', email: null } });
    dbMocks.hiddenCardFindMany.mockResolvedValue([{ cardId: 'SS-121-R' }]);

    const res = await revealingCardsRoute();
    const body = await res.json();

    expect(body.privileged).toBe(true);
    expect(body.unrevealedIds).toEqual(['SS-121-R']);
    expect(Object.keys(body.cards)).toContain('SS-121-R');
    expect(dbMocks.userFindUnique).not.toHaveBeenCalled();
  });

  it('delivers nothing at all from a coming-soon set', async () => {
    dbMocks.auth.mockResolvedValue({ user: { id: 'admin1', name: 'Kutxyt', email: null } });
    dbMocks.hiddenCardFindMany.mockResolvedValue([]);
    dbMocks.siteSettingsFindUnique.mockResolvedValue({
      setStatusOverrides: { SS: 'coming_soon' },
      variantObtentionConfig: null,
    });
    await reloadSetConfig();

    const res = await revealingCardsRoute();
    const body = await res.json();

    expect(Object.keys(body.cards)).toHaveLength(0);
    expect(body.unrevealedIds).toEqual([]);
  });
});

describe('a deck containing an unrevealed card cannot be shared in the feed', () => {
  beforeEach(() => {
    applySetStatusOverrides({ SS: 'revealing' });
  });
  afterEach(() => {
    applySetStatusOverrides({});
  });


  beforeEach(() => {
    dbMocks.deckFindUnique.mockReset();
    dbMocks.hiddenCardFindMany.mockReset();
    dbMocks.postCreate.mockReset();
    invalidateRevealCache();
  });

  afterEach(() => {
    invalidateRevealCache();
  });

  it('refuses a deck whose character list holds an unrevealed card', async () => {
    dbMocks.deckFindUnique.mockResolvedValue({
      id: 'deck1',
      name: 'Secret tech',
      cardIds: ['KS-001-C', 'SS-121-R'],
      missionIds: ['KS-MSS01-MMS'],
      userId: 'author',
    });
    dbMocks.hiddenCardFindMany.mockResolvedValue([{ cardId: 'SS-121-R' }]);

    const res = await createPost('author', { deckId: 'deck1' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errorKey).toBe('feed.error.deckHasUnrevealed');
      expect(res.status).toBe(400);
    }
    expect(dbMocks.postCreate).not.toHaveBeenCalled();
  });

  it('refuses a deck whose mission list holds an unrevealed card', async () => {
    dbMocks.deckFindUnique.mockResolvedValue({
      id: 'deck1',
      name: 'Secret mission',
      cardIds: ['KS-001-C'],
      missionIds: ['SS-121-R'],
      userId: 'author',
    });
    dbMocks.hiddenCardFindMany.mockResolvedValue([{ cardId: 'SS-121-R' }]);

    const res = await createPost('author', { deckId: 'deck1' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorKey).toBe('feed.error.deckHasUnrevealed');
    expect(dbMocks.postCreate).not.toHaveBeenCalled();
  });

  it('refuses a holo copy of an unrevealed card too', async () => {
    dbMocks.deckFindUnique.mockResolvedValue({
      id: 'deck1',
      name: 'Holo secret',
      cardIds: ['SS-121-R_H'],
      missionIds: [],
      userId: 'author',
    });
    dbMocks.hiddenCardFindMany.mockResolvedValue([{ cardId: 'SS-121-R' }]);

    const res = await createPost('author', { deckId: 'deck1' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorKey).toBe('feed.error.deckHasUnrevealed');
  });

  it('lets the same deck through once the card is revealed', async () => {
    dbMocks.deckFindUnique.mockResolvedValue({
      id: 'deck1',
      name: 'Now public',
      cardIds: ['KS-001-C', 'SS-121-R'],
      missionIds: [],
      userId: 'author',
    });
    dbMocks.hiddenCardFindMany.mockResolvedValue([]);
    dbMocks.postCreate.mockRejectedValue(new Error('reached-post-create'));

    await expect(createPost('author', { deckId: 'deck1' })).rejects.toThrow('reached-post-create');
    expect(dbMocks.postCreate).toHaveBeenCalledTimes(1);
  });

  it('refuses a deck that does not belong to the author before any reveal check', async () => {
    dbMocks.deckFindUnique.mockResolvedValue({
      id: 'deck1',
      name: 'Not mine',
      cardIds: ['KS-001-C'],
      missionIds: [],
      userId: 'someone-else',
    });
    dbMocks.hiddenCardFindMany.mockResolvedValue([]);

    const res = await createPost('author', { deckId: 'deck1' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorKey).toBe('feed.error.deckNotYours');
    expect(dbMocks.hiddenCardFindMany).not.toHaveBeenCalled();
  });

  it('never blocks a released-set deck', async () => {
    dbMocks.deckFindUnique.mockResolvedValue({
      id: 'deck1',
      name: 'Konoha classic',
      cardIds: ['KS-001-C', 'KS-002-C'],
      missionIds: [],
      userId: 'author',
    });
    dbMocks.hiddenCardFindMany.mockResolvedValue([{ cardId: 'KS-001-C' }]);
    dbMocks.postCreate.mockRejectedValue(new Error('reached-post-create'));

    await expect(createPost('author', { deckId: 'deck1' })).rejects.toThrow('reached-post-create');
  });
});
