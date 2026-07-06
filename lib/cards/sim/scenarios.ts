import type { GameState, PendingAction, PlayerID, GameAction, GameLogEntry, CharacterInPlay } from '@/lib/engine/types';
import { buildGeneratedScenario } from '@/lib/cards/sim/generate';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCharacterById } from '@/lib/data/cardIndex';
import { phase810KindForEffect, phase810Scenario } from '@/lib/cards/sim/phase810';
import { firesUpgrade, upgradeScenario } from '@/lib/cards/sim/upgradeSim';
import { minimizeScenario } from '@/lib/cards/sim/minimize';

export interface SimScenario {
  build: () => GameState;
  play: { player: PlayerID; action: GameAction };
  followups?: Array<{ player: PlayerID; action: GameAction }>;
  choose?: (state: GameState, pending: PendingAction) => string[];
  focusInstanceId?: string;
  narrationKey?: string;
  noMinimize?: boolean;
}

const DECKF = () => ['KS-021-C', 'KS-011-C', 'KS-007-C', 'KS-086-C', 'KS-052-C']
  .map((id) => getCharacterById(id)!).filter(Boolean);

interface Enemy { id: string; iid?: string; hidden?: boolean; tokens?: number }
interface BoardOpts {
  hand?: string[];
  p1m0?: Array<string | { id: string; iid: string; hidden?: boolean; tokens?: number }>;
  p1m1?: string[];
  e0?: Enemy[];
  e1?: Enemy[];
  hidden0?: { id: string; iid: string };
  upgBase?: { id: string; iid: string };
  extraP2m0?: CharacterInPlay[];
  p2chakra?: number;
  p2hand?: string[];
  missions?: number;
  missionIds?: string[];
  chakra?: number;
  edge?: PlayerID;
}

function board(o: BoardOpts): GameState {
  const p1: CharacterInPlay[] = [];
  for (let i = 0; i < (o.p1m0 ?? []).length; i++) {
    const f = (o.p1m0 ?? [])[i];
    if (typeof f === 'string') p1.push(simChar(f, { owner: 'player1', instanceId: `sf0-${i}` }));
    else p1.push(simChar(f.id, { owner: 'player1', instanceId: f.iid, hidden: f.hidden, powerTokens: f.tokens }));
  }
  if (o.hidden0) p1.push(simChar(o.hidden0.id, { owner: 'player1', instanceId: o.hidden0.iid, hidden: true }));
  if (o.upgBase) p1.push(simChar(o.upgBase.id, { owner: 'player1', instanceId: o.upgBase.iid }));
  const p2: CharacterInPlay[] = (o.e0 ?? []).map((e, i) =>
    simChar(e.id, { owner: 'player2', instanceId: e.iid ?? `se0-${i}`, hidden: e.hidden, powerTokens: e.tokens }));
  for (const c of o.extraP2m0 ?? []) p2.push(c);
  const st = buildSimState({ hand1: o.hand ?? [], p1, p2, missions: o.missions ?? 2, missionIds: o.missionIds, chakra1: o.chakra ?? 20, edgeHolder: o.edge ?? 'player1' });
  (o.p1m1 ?? []).forEach((id, i) => st.activeMissions[1].player1Characters.push(simChar(id, { owner: 'player1', instanceId: `sf1-${i}`, missionIndex: 1 })));
  (o.e1 ?? []).forEach((e, i) => st.activeMissions[1].player2Characters.push(simChar(e.id, { owner: 'player2', instanceId: e.iid ?? `se1-${i}`, missionIndex: 1, hidden: e.hidden, powerTokens: e.tokens })));
  st.player1.deck = DECKF();
  st.player2.deck = DECKF();
  if (o.p2chakra != null) st.player2.chakra = o.p2chakra;
  if (o.p2hand) st.player2.hand = o.p2hand.map((id) => getCharacterById(id)!).filter(Boolean);
  return st;
}

const FRESH: GameAction = { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false };
const reveal = (iid: string): GameAction => ({ type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: iid });
const upgrade = (iid: string): GameAction => ({ type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: iid });
const P1 = (action: GameAction) => ({ player: 'player1' as PlayerID, action });

function upgradedEnemyStack(baseId: string, topId: string, iid: string, missionIndex = 0): CharacterInPlay {
  const base = getCharacterById(baseId)!;
  const top = getCharacterById(topId)!;
  return {
    instanceId: iid, card: top, stack: [base, top],
    isHidden: false, wasRevealedAtLeastOnce: true, powerTokens: 0,
    controlledBy: 'player2', originalOwner: 'player2', missionIndex,
  };
}

const HID = 'sim-demo-hidden';
type Factory = (id: string) => SimScenario;

// Each factory takes the demo card id (base or any variant sharing the effect) so variants reuse it.
const FACTORIES: Record<string, Factory> = {
  'KS-022-UC': (id) => ({
    build: () => {
      const st = board({ hidden0: { id, iid: HID }, e0: [{ id: 'KS-005-C', iid: 'sim-lastplayed' }] });
      const log: GameLogEntry = { turn: st.turn, phase: 'action', player: 'player2', action: 'PLAY_CHARACTER',
        details: 'Opponent plays Shizune on mission 1.', messageKey: 'game.log.playCharacter',
        messageParams: { card: 'SHIZUNE', title: '', mission: 1, cost: 1 }, timestamp: Date.now() };
      st.log = [...st.log, log];
      return st;
    },
    play: P1(reveal(HID)),
  }),
  'KS-002-UC': (id) => ({ build: () => board({ hand: [id, 'KS-009-C'] }), play: P1(FRESH) }),
  'KS-010-C': (id) => ({ build: () => board({ hidden0: { id, iid: HID } }), play: P1(reveal(HID)) }),
  'KS-011-C': (id) => ({ build: () => board({ hand: [id], p1m0: ['KS-009-C'] }), play: P1(FRESH) }),
  'KS-018-UC': (id) => ({ build: () => board({ hand: [id], upgBase: { id: 'KS-017-C', iid: 'sim-upg-base' }, e1: [{ id: 'KS-005-C' }] }), play: P1(upgrade('sim-upg-base')) }),
  'KS-028-UC': (id) => ({ build: () => board({ hidden0: { id, iid: HID }, p1m0: ['KS-025-C'] }), play: P1(reveal(HID)) }),
  'KS-033-UC': (id) => ({ build: () => board({ hand: [id], upgBase: { id: 'KS-032-C', iid: 'sim-upg-base' } }), play: P1(upgrade('sim-upg-base')) }),
  'KS-047-C': (id) => ({ build: () => board({ hand: [id], p1m0: ['KS-009-C'] }), play: P1(FRESH) }),
  'KS-057-C': (id) => ({ build: () => board({ hand: [id], p1m0: ['KS-064-C'], p1m1: ['KS-059-C'] }), play: P1(FRESH) }),
  'KS-058-UC': (id) => ({ build: () => board({ hand: [id], p1m0: ['KS-064-C', 'KS-059-C'] }), play: P1(FRESH) }),
  'KS-059-C': (id) => ({ build: () => board({ hand: [id], p1m0: ['KS-064-C', 'KS-009-C'] }), play: P1(FRESH) }),
  'KS-061-C': (id) => ({ build: () => board({ hand: [id], p1m0: ['KS-064-C'] }), play: P1(FRESH) }),
  'KS-062-UC': (id) => ({ build: () => board({ hidden0: { id, iid: HID }, p1m0: ['KS-057-C', 'KS-064-C'] }), play: P1(reveal(HID)) }),
  'KS-066-UC': (id) => ({ build: () => board({ hand: [id], p1m0: ['KS-064-C'], p2chakra: 5 }), play: P1(FRESH) }),
  'KS-087-UC': (id) => ({ build: () => board({ hand: [id], e0: [{ id: 'KS-005-C', iid: 'sim-lone' }] }), play: P1(FRESH) }),
  'KS-098-C': (id) => ({ build: () => board({ hand: [id], p1m0: ['KS-003-C'] }), play: P1(FRESH) }),
  'KS-102-UC': (id) => ({ build: () => board({ hidden0: { id, iid: HID }, e0: [{ id: 'KS-094-C', iid: 'sim-enemy-summon' }] }), play: P1(reveal(HID)) }),
  'KS-106-R': (id) => ({ build: () => board({ hand: [id], extraP2m0: [upgradedEnemyStack('KS-010-C', 'KS-108-R', 'sim-enemy-upg', 0)] }), play: P1(FRESH) }),
  'KS-110-R': (id) => ({ build: () => board({ hand: [id], e0: [{ id: 'KS-005-C', iid: 'sim-weak' }, { id: 'KS-086-C', iid: 'sim-strong' }] }), play: P1(FRESH) }),
  'KS-113-R': (id) => ({ build: () => board({ hand: [id], p1m0: ['KS-027-C', 'KS-009-C'] }), play: P1(FRESH) }),
  'KS-138-S': (id) => ({ build: () => board({ hand: [id], upgBase: { id: 'KS-063-UC', iid: 'sim-upg-base' } }), play: P1(upgrade('sim-upg-base')) }),
  'SS-122-SPV': (id) => ({
    build: () => board({
      hand: [id],
      p1m0: [{ id: 'KS-076-UC', iid: 'sim-tb' }],
      extraP2m0: [upgradedEnemyStack('KS-075-C', 'KS-076-UC', 'sim-enemy-biju')],
    }),
    play: P1(FRESH),
    choose: (state, pending) => {
      const opts = pending.options ?? [];
      if (opts.includes('sim-enemy-biju')) return ['sim-enemy-biju'];
      return opts.slice(0, Math.max(1, pending.minSelections ?? 1));
    },
    noMinimize: true,
  }),
};

const PASS_ACTION: GameAction = { type: 'PASS' };
const VANILLA = 'KS-009-C';

function missionFiller(missionId: string): string {
  return missionId === 'KS-006-MMS' ? 'KS-001-MMS' : 'KS-006-MMS';
}

function scoreMissionScenario(missionId: string, extra: Partial<BoardOpts> = {}): SimScenario {
  return {
    build: () => board({ p1m0: [VANILLA], ...extra, missionIds: [missionId, missionFiller(missionId)] }),
    play: P1(PASS_ACTION),
    followups: [{ player: 'player2', action: PASS_ACTION }],
    noMinimize: true,
  };
}

const MISSION_FACTORIES: Record<string, () => SimScenario> = {
  'KS-001-MMS': () => scoreMissionScenario('KS-001-MMS'),
  'KS-002-MMS': () => ({
    build: () => board({ hand: ['KS-086-C'], p1m0: [VANILLA], missionIds: ['KS-002-MMS', 'KS-006-MMS'] }),
    play: P1(FRESH),
    noMinimize: true,
  }),
  'KS-003-MMS': () => scoreMissionScenario('KS-003-MMS', { p2hand: ['KS-005-C'] }),
  'KS-004-MMS': () => scoreMissionScenario('KS-004-MMS', { e0: [{ id: 'KS-005-C', iid: 'sim-hid-enemy', hidden: true }] }),
  'KS-005-MMS': () => scoreMissionScenario('KS-005-MMS'),
  'KS-006-MMS': () => scoreMissionScenario('KS-006-MMS'),
  'KS-007-MMS': () => scoreMissionScenario('KS-007-MMS', { hidden0: { id: 'KS-005-C', iid: 'sim-hid-ally' } }),
  'KS-008-MMS': () => scoreMissionScenario('KS-008-MMS', { hand: ['KS-005-C'] }),
  'KS-009-MMS': () => ({
    build: () => board({ hand: ['KS-086-C'], p1m0: ['KS-005-C'], missionIds: ['KS-009-MMS', 'KS-006-MMS'] }),
    play: P1(FRESH),
    noMinimize: true,
  }),
  'KS-010-MMS': () => ({
    build: () => board({ p1m0: [VANILLA], missionIds: ['KS-010-MMS', 'KS-006-MMS'] }),
    play: P1(PASS_ACTION),
    followups: [
      { player: 'player2', action: PASS_ACTION },
      P1({ type: 'ADVANCE_PHASE' }),
      P1({ type: 'ADVANCE_PHASE' }),
    ],
    noMinimize: true,
  }),
};

export function hasMissionScenario(cardId: string): boolean {
  return !!MISSION_FACTORIES[cardId];
}

// Resolve a variant (RA/MV/SV/L/_2...) to a curated base with the same set+number, since variants share the effect.
function curatedBaseFor(cardId: string): string | undefined {
  if (FACTORIES[cardId]) return cardId;
  const card = getCharacterById(cardId);
  if (!card) return undefined;
  for (const baseId of Object.keys(FACTORIES)) {
    const base = getCharacterById(baseId);
    if (base && base.set === card.set && base.number === card.number) return baseId;
  }
  return undefined;
}

export function hasCuratedScenario(cardId: string): boolean {
  return curatedBaseFor(cardId) !== undefined;
}

const SKIP_MINIMIZE_KINDS = new Set(['moveblock', 'revealblock', 'hideallyblock', 'immunity', 'winrestrict']);
const minimizeCache = new Map<string, SimScenario | undefined>();

function buildScenario(cardId: string, effectIndex: number): { scenario: SimScenario | undefined; kind: string | null } {
  const missionFactory = MISSION_FACTORIES[cardId];
  if (missionFactory) return { scenario: missionFactory(), kind: null };
  const card = getCharacterById(cardId);
  const eff = card?.effects?.[effectIndex];
  if (card && eff?.type === 'UPGRADE' && firesUpgrade(card)) return { scenario: upgradeScenario(card), kind: null };
  const base = curatedBaseFor(cardId);
  if (base) return { scenario: FACTORIES[base](cardId), kind: null };
  const p810 = phase810KindForEffect(cardId, effectIndex);
  if (p810) return { scenario: phase810Scenario(cardId, p810), kind: p810 };
  return { scenario: buildGeneratedScenario(cardId) ?? undefined, kind: null };
}

export function getScenario(cardId: string, effectIndex = 0): SimScenario | undefined {
  const cacheKey = `${cardId}#${effectIndex}`;
  if (minimizeCache.has(cacheKey)) return minimizeCache.get(cacheKey);
  const { scenario, kind } = buildScenario(cardId, effectIndex);
  const result = (!scenario || scenario.noMinimize || (kind && SKIP_MINIMIZE_KINDS.has(kind))) ? scenario : minimizeScenario(scenario);
  minimizeCache.set(cacheKey, result);
  return result;
}
