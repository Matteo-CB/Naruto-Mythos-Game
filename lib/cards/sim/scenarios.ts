import type { GameState, PendingAction, PlayerID, GameAction, GameLogEntry, CharacterInPlay } from '@/lib/engine/types';
import { buildGeneratedScenario, buildScenarioForEffect, revealScenarioFor } from '@/lib/cards/sim/generate';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById, getCharacterById, getMissionById } from '@/lib/data/cardIndex';
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
  'SS-142-S': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-141-S'], chakra: 14 }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-143-S': (id) => ({
    build: () => {
      const st = board({ hand: [id], p1m0: ['SS-144-S'], chakra: 14 });
      st.player1.deck = ['KS-009-C', 'KS-010-C'].map((x) => getCharacterById(x)!).filter(Boolean);
      return st;
    },
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-146-S': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-145-S'], chakra: 14 }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-003-C': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-010-C'] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-012-C': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-009-C'] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-063-C': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-062-C'] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-064-C': (id) => ({
    build: () => {
      const st = board({ hand: [id], p1m0: ['SS-062-C'] });
      st.player1.deck = ['KS-009-C', 'KS-010-C'].map((x) => getCharacterById(x)!).filter(Boolean);
      return st;
    },
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-071-C': (id) => ({
    build: () => {
      const st = board({ hand: [id], p1m0: [{ id: 'SS-010-C', iid: 'sim-porteur' }] });
      const hote = st.activeMissions[0].player1Characters[0];
      hote.attachments = [{ instanceId: 'att-sim', card: getCardById('SS-080-C') as never, owner: 'player1' }];
      return st;
    },
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-011-C': (id) => ({
    build: () => board({ hand: [id], e0: [{ id: 'KS-005-C', iid: 'sim-cache-vu', hidden: true }] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-059-C': (id) => ({
    build: () => board({ hand: [id], e0: [{ id: 'SS-054-UC', iid: 'sim-cache-cher', hidden: true }] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-028-UC': (id) => ({
    build: () => {
      const st = board({ hand: [id] });
      st.player2.deck = ['KS-009-C', 'KS-010-C'].map((x) => getCharacterById(x)!).filter(Boolean);
      return st;
    },
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-004-UC': (id) => ({
    build: () => {
      const st = board({ hand: [id] });
      st.player1.deck = ['SS-004-UC', 'KS-009-C', 'KS-010-C', 'KS-005-C'].map((x) => getCharacterById(x)!).filter(Boolean);
      return st;
    },
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-058-UC': (id) => ({
    build: () => {
      const st = board({ hand: [id] });
      st.player1.deck = ['SS-126-R', 'KS-009-C', 'KS-010-C', 'KS-005-C'].map((x) => getCharacterById(x)!).filter(Boolean);
      return st;
    },
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-074-C': (id) => ({
    build: () => {
      const st = board({ hand: [id] });
      st.player1.deck = ['KS-009-C', 'KS-010-C', 'KS-005-C', 'KS-086-C', 'KS-003-C'].map((x) => getCharacterById(x)!).filter(Boolean);
      st.player1.deck[2] = getCardById('SS-080-C') as never;
      return st;
    },
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-083-UC': (id) => ({
    build: () => board({ hand: [id], e0: [{ id: 'SS-062-C', iid: 'sim-bavard' }], p1m0: ['KS-009-C'] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-084-C': (id) => ({
    build: () => board({ hand: [id], e0: [{ id: 'SS-010-C', iid: 'sim-charge' }], p1m0: ['KS-009-C'] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-086-C': (id) => ({
    build: () => board({ hand: [id], p1m0: ['KS-009-C'], missions: 2 }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-087-UC': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-115-R'] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-088-UC': (id) => ({
    build: () => board({ hand: [id], e0: [{ id: 'SS-010-C', iid: 'sim-hote' }], p1m0: ['KS-009-C'] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-090-UC': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-054-UC'], e0: [{ id: 'SS-010-C', iid: 'sim-donneur', tokens: 3 }] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-095-UC': (id) => ({
    build: () => {
      const st = board({ hand: [id], p1m0: ['SS-010-C'] });
      st.player1.deck = ['SS-057-UC', 'KS-009-C', 'KS-010-C'].map((x) => getCharacterById(x)!).filter(Boolean);
      return st;
    },
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-096-UC': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-010-C'] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-097-UC': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-010-C'] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-098-UC': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-024-C', 'SS-010-C'] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-100-C': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-010-C'], e0: [{ id: 'KS-005-C', iid: 'sim-cache-ennemi', hidden: true }] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-102-UC': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-010-C'] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-103-UC': (id) => ({
    build: () => board({ hand: [id], p1m0: ['KS-009-C'] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-104-C': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-010-C'] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-105-UC': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-032-C'] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-106-C': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-054-UC'] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-107-C': (id) => ({
    build: () => board({ hand: [id], p1m0: ['KS-009-C'] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-109-UC': (id) => ({
    build: () => {
      const st = board({ hand: [id], p1m0: ['KS-009-C'] });
      st.player1.deck = ['KS-009-C', 'KS-010-C'].map((x) => getCharacterById(x)!).filter(Boolean);
      return st;
    },
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-110-UC': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-010-C'] }),
    play: P1(FRESH), noMinimize: true,
  }),
  'SS-001-UC': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-010-C', 'SS-024-C'] }),
    play: P1(FRESH),
    noMinimize: true,
  }),
  'SS-010-C': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-009-C'] }),
    play: P1(FRESH),
    noMinimize: true,
  }),
  'SS-015-UC': (id) => ({
    build: () => board({ hand: [id] }),
    play: P1(FRESH),
    followups: [{ player: 'player2', action: PASS_ACTION }, P1(PASS_ACTION)],
    noMinimize: true,
  }),
  'SS-026-C': (id) => ({
    build: () => board({ hand: ['SS-079-C'], p1m0: [{ id, iid: 'sim-genma' }] }),
    play: P1({ type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false }),
    noMinimize: true,
  }),
  'SS-054-UC': (id) => ({
    build: () => board({ hand: [id], e0: [{ id: 'SS-126-R', iid: 'sim-sasuke' }] }),
    play: P1(FRESH),
    noMinimize: true,
  }),
  'SS-062-C': (id) => ({
    build: () => board({ hand: [id], p1m0: [{ id: 'SS-063-C', iid: 'sim-udon' }] }),
    play: P1(FRESH),
    noMinimize: true,
  }),
  'SS-066-C': (id) => ({
    build: () => board({ hand: ['SS-080-C'], p1m0: [{ id, iid: 'sim-aoi' }] }),
    play: P1({ type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false }),
    noMinimize: true,
  }),
  'SS-067-C': (id) => ({
    build: () => board({ hand: ['SS-082-C'], p1m0: [{ id, iid: 'sim-sansho' }, { id: 'KS-009-C', iid: 'sim-hote' }] }),
    play: P1({ type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false }),
    noMinimize: true,
  }),
  'SS-069-UC': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-070-UC'] }),
    play: P1(FRESH),
    noMinimize: true,
  }),
  'SS-070-UC': (id) => ({
    build: () => board({ hand: [id], p1m0: ['SS-069-UC'] }),
    play: P1(FRESH),
    noMinimize: true,
  }),
  'SS-075-UC': (id) => ({
    build: () => board({ hand: ['SS-054-UC'], p1m0: [{ id, iid: 'sim-gato' }], chakra: 12 }),
    play: P1({ type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false }),
    noMinimize: true,
  }),
  'SS-116-R': (id) => ({
    build: () => board({ hand: ['SS-087-UC'], p1m0: [{ id, iid: 'sim-guy' }, { id: 'SS-115-R', iid: 'sim-lee' }] }),
    play: P1({ type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false }),
    followups: [{ player: 'player2', action: PASS_ACTION }, P1(PASS_ACTION)],
    noMinimize: true,
  }),
  'SS-082-C': (id) => ({
    build: () => board({ hand: [id], p1m0: ['KS-009-C'] }),
    play: P1(FRESH),
    noMinimize: true,
  }),
  'SS-046-UC': (id) => ({
    build: () => {
      const st = board({ hand: [id] });
      st.player1.deck = ['KS-009-C', 'KS-010-C', 'SS-051-UC']
        .map((x) => getCharacterById(x)!).filter(Boolean);
      return st;
    },
    play: P1(FRESH),
    noMinimize: true,
  }),
  'SS-037-UC': (id) => ({
    build: () => board({
      hand: [id, 'SS-032-C', 'SS-034-C'],
      upgBase: { id: 'SS-036-C', iid: 'sim-sakon-base' },
      e0: [{ id: 'KS-005-C', iid: 'sim-prey', hidden: true }],
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
    }),
    play: P1(FRESH),
    noMinimize: true,
  }),
  'SS-041-UC': (id) => ({
    build: () => board({
      hand: [id],
      p1m0: [{ id: 'SS-045-C', iid: 'sim-dosu-ally' }],
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
    }),
    play: P1(FRESH),
    noMinimize: true,
  }),
  'SS-043-UC': (id) => ({
    build: () => {
      const st = board({ hand: [id] });
      st.player1.discardPile = [getCharacterById('KS-009-C')!];
      return st;
    },
    play: P1(FRESH),
    noMinimize: true,
  }),
  'KS-111-R': (id) => ({
    build: () => board({
      p1m0: [{ id, iid: 'sim-shika' }],
      e0: [{ id: 'KS-052-C', iid: 'sim-shika-locked', hidden: true }],
      e1: [{ id: 'KS-005-C', iid: 'sim-shika-free', hidden: true }],
      p2chakra: 20,
    }),
    play: P1(PASS_ACTION),
    followups: [
      { player: 'player2', action: { type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'sim-shika-locked' } },
      { player: 'player2', action: { type: 'REVEAL_CHARACTER', missionIndex: 1, characterInstanceId: 'sim-shika-free' } },
    ],
    noMinimize: true,
  }),
  'SS-049-C': (id) => ({
    build: () => board({
      hand: [id],
      e0: [{ id: 'KS-005-C', iid: 'sim-fs-enemy' }],
      edge: 'player1',
    }),
    play: P1(FRESH),
    noMinimize: true,
  }),
  'SS-051-UC': (id) => ({
    build: () => board({ hand: [id, 'SS-046-UC'] }),
    play: P1(FRESH),
    followups: [
      { player: 'player2', action: PASS_ACTION },
      P1({ type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 1, hidden: false }),
    ],
    noMinimize: true,
  }),
  'SS-114-R': (id) => ({
    build: () => board({
      hand: [id, 'SS-046-UC'],
      e0: [{ id: 'KS-005-C', iid: 'sim-cheap-enemy' }],
    }),
    play: P1(FRESH),
    noMinimize: true,
  }),
  'SS-108-C': (id) => ({
    build: () => board({
      hand: [id],
      p1m0: [{ id: 'SS-120-CHIBIV', iid: 'sim-kiba' }],
      e0: [{ id: 'KS-005-C', iid: 'sim-weak' }],
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
    }),
    play: P1(FRESH),
    followups: [
      { player: 'player2', action: PASS_ACTION },
      P1(PASS_ACTION),
    ],
    noMinimize: true,
  }),
  'SS-115-SHINOBIV': (id) => ({
    build: () => board({
      hand: [id, 'KS-119-R'],
      p1m0: ['SS-046-UC'],
      e0: [{ id: 'KS-005-C', iid: 'sim-lee-prey' }],
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
    }),
    play: P1(FRESH),
    followups: [
      { player: 'player2', action: PASS_ACTION },
      P1(FRESH),
    ],
    noMinimize: true,
  }),
  'SS-031-CHIBIV': (id) => ({
    build: () => board({
      hand: [id, 'KS-057-C', 'KS-064-C'],
      p1m0: ['KS-009-C'],
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
    }),
    play: P1(FRESH),
    noMinimize: true,
  }),
  'SS-111-SHINOBIV': (id) => ({
    build: () => {
      const st = board({
        hand: [id, 'KS-036-C'],
        p1m0: ['KS-116-R'],
        missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      });
      const discarded = getCharacterById('KS-030-C');
      if (discarded) st.player1.discardPile = [discarded];
      return st;
    },
    play: P1(FRESH),
    noMinimize: true,
  }),
  'SS-128-R': (id) => ({
    build: () => board({
      hand: [id, 'SS-082-C'],
      p1m0: ['KS-057-C'],
      e0: [{ id: 'KS-136-S', iid: 'sim-big' }],
    }),
    play: P1(FRESH),
    followups: [
      { player: 'player2', action: PASS_ACTION },
      P1(FRESH),
    ],
    choose: (state, pending) => {
      const opts = pending.options ?? [];
      if (pending.descriptionKey === 'game.effect.desc.attachChooseTarget') return [opts[opts.length - 1]];
      return opts.slice(0, Math.max(1, pending.minSelections ?? 1));
    },
    noMinimize: true,
  }),
  'SS-008-C': (id) => ({
    build: () => board({
      hand: [id, 'KS-013-C'],
      chakra: 20,
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
    }),
    play: P1(FRESH),
    choose: (state, pending) => {
      const opts = pending.options ?? [];
      const hand = opts.find((o) => o.startsWith('HAND_'));
      if (hand) return [hand];
      return opts.slice(0, Math.max(1, pending.minSelections ?? 1));
    },
    noMinimize: true,
  }),
  'SS-148-SV': (id) => ({
    build: () => board({
      hand: [id],
      chakra: 20,
      extraP2m0: [upgradedEnemyStack('KS-005-C', 'KS-021-C', 'sim-upgraded-foe')],
      e0: [{ id: 'KS-009-C', iid: 'sim-naruto' }],
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
    }),
    play: P1(FRESH),
    noMinimize: true,
  }),
  'SS-150-SV': (id) => ({
    build: () => board({
      hand: [id],
      upgBase: { id: 'KS-086-C', iid: 'sim-upg-base' },
      chakra: 20,
      e0: [{ id: 'KS-015-C', iid: 'sim-kakashi' }],
      e1: [{ id: 'KS-136-S', iid: 'sim-strong-foe' }],
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
    }),
    play: P1(FRESH),
    noMinimize: true,
  }),
  'SS-118-CHIBIV': (id) => ({
    build: () => board({
      hand: [],
      chakra: 20,
      hidden0: { id, iid: HID },
      e0: [
        { id: 'KS-009-C', iid: 'sim-ghost', hidden: true },
        { id: 'SS-119-R', iid: 'sim-temari' },
      ],
      e1: [{ id: 'KS-009-C', iid: 'sim-twin' }],
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
    }),
    play: P1(reveal(HID)),
    choose: (state, pending) => {
      const opts = pending.options ?? [];
      const ghost = opts.find((o) => o === 'sim-ghost');
      if (ghost) return [ghost];
      const twin = opts.find((o) => o === 'sim-twin');
      if (twin) return [twin];
      return opts.slice(0, Math.max(1, pending.minSelections ?? 1));
    },
    noMinimize: true,
  }),
  'SS-123-MV': (id) => ({
    build: () => {
      const stolen = simChar('KS-009-C', { owner: 'player1', instanceId: 'sim-stolen', missionIndex: 0 });
      stolen.controlledBy = 'player2';
      stolen.controllerInstanceId = 'sim-ino';
      return board({
        hand: [id],
        chakra: 20,
        e0: [{ id: 'KS-019-C', iid: 'sim-ino' }],
        extraP2m0: [stolen],
      });
    },
    play: P1(FRESH),
    noMinimize: true,
  }),
  'SS-999-L': (id) => ({
    build: () => {
      const st = board({
        hand: [id],
        upgBase: { id: 'KS-104-R', iid: 'sim-upg-base' },
        chakra: 20,
        missionIds: ['KS-001-MMS', 'KS-006-MMS'],
      });
      st.player1.discardPile = ['KS-009-C', 'KS-011-C', 'KS-021-C']
        .map((x) => getCharacterById(x)!).filter(Boolean);
      return st;
    },
    play: P1(upgrade('sim-upg-base')),
    choose: (state, pending) => {
      const opts = pending.options ?? [];
      if (pending.descriptionKey === 'game.effect.desc.ss001ChooseCount') return [opts[opts.length - 1]];
      return opts.slice(0, Math.max(1, pending.minSelections ?? 1));
    },
    noMinimize: true,
  }),
  'SS-998-L': (id) => ({
    build: () => board({
      hand: [id, 'KS-096-C'],
      upgBase: { id: 'KS-007-C', iid: 'sim-upg-base' },
      p1m1: ['KS-097-C'],
      chakra: 20,
      missionIds: ['KS-001-MMS', 'KS-006-MMS'],
    }),
    play: P1(upgrade('sim-upg-base')),
    choose: (state, pending) => {
      const opts = pending.options ?? [];
      const hand = opts.find((o) => o.startsWith('HAND_'));
      if (hand) return [hand];
      return opts.slice(0, Math.max(1, pending.minSelections ?? 1));
    },
    noMinimize: true,
  }),
  'SS-149-L': (id) => ({
    build: () => {
      const st = board({ hand: [id], chakra: 20 });
      st.player1.deck = ['KS-099-C', 'KS-100-C', 'KS-021-C'].map((x) => getCharacterById(x)!).filter(Boolean);
      return st;
    },
    play: P1(FRESH),
    noMinimize: true,
  }),
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
  'SS-001-MMS': () => ({
    build: () => board({ hand: ['KS-086-C'], p1m0: [VANILLA], missionIds: ['SS-001-MMS', 'KS-006-MMS'] }),
    play: P1(FRESH),
    noMinimize: true,
  }),
  'SS-002-MMS': () => scoreMissionScenario('SS-002-MMS', { e0: [{ id: 'KS-005-C', iid: 'sim-hid-enemy', hidden: true }] }),
  'SS-003-MMS': () => scoreMissionScenario('SS-003-MMS'),
  'SS-004-MMS': () => scoreMissionScenario('SS-004-MMS', { p1m0: ['KS-081-C'] }),
  'SS-005-MMS': () => ({
    build: () => board({ p1m0: [VANILLA], e0: [{ id: 'KS-136-S', iid: 'sim-strong' }], missionIds: ['SS-005-MMS', 'KS-006-MMS'] }),
    play: P1(PASS_ACTION),
    followups: [
      { player: 'player2', action: PASS_ACTION },
      P1({ type: 'ADVANCE_PHASE' }),
      P1({ type: 'ADVANCE_PHASE' }),
    ],
    noMinimize: true,
  }),
  'SS-006-MMS': () => ({
    build: () => board({ hidden0: { id: 'KS-005-C', iid: 'sim-hid-ally' }, p1m0: [VANILLA], missionIds: ['SS-006-MMS', 'KS-006-MMS'] }),
    play: P1({ type: 'REVEAL_CHARACTER', characterInstanceId: 'sim-hid-ally', missionIndex: 0 }),
    noMinimize: true,
  }),
  'SS-007-MMS': () => scoreMissionScenario('SS-007-MMS', { e0: [{ id: 'KS-005-C', iid: 'sim-weak-enemy' }] }),
  'SS-008-MMS': () => ({
    build: () => board({
      p1m0: [VANILLA, { id: 'KS-005-C', iid: 'sim-tt-2' }],
      hand: ['KS-086-C'],
      missionIds: ['SS-008-MMS', 'KS-006-MMS'],
    }),
    play: P1(FRESH),
    followups: [
      { player: 'player2', action: PASS_ACTION },
      P1(PASS_ACTION),
    ],
    noMinimize: true,
  }),
  'SS-009-MMS': () => scoreMissionScenario('SS-009-MMS'),
  'SS-010-MMS': () => scoreMissionScenario('SS-010-MMS', { e0: [{ id: 'KS-005-C', iid: 'sim-att-host' }] }),
};

function missionFactoryKeyFor(cardId: string): string | undefined {
  if (MISSION_FACTORIES[cardId]) return cardId;
  const base = cardId.replace(/_\d+-MMS$/, '-MMS');
  return MISSION_FACTORIES[base] ? base : undefined;
}

export function hasMissionScenario(cardId: string): boolean {
  return missionFactoryKeyFor(cardId) !== undefined;
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
  const missionKey = missionFactoryKeyFor(cardId);
  if (missionKey) {
    const scenario = MISSION_FACTORIES[missionKey]();
    if (missionKey !== cardId) {
      const original = scenario.build;
      scenario.build = () => {
        const built = original();
        for (const mission of built.activeMissions) {
          if (mission.card.id === missionKey) {
            const swapped = getMissionById(cardId);
            if (swapped) mission.card = swapped;
          }
        }
        return built;
      };
    }
    return { scenario, kind: null };
  }
  const card = getCharacterById(cardId);
  const eff = card?.effects?.[effectIndex];
  if (card && eff?.type === 'UPGRADE' && firesUpgrade(card)) return { scenario: upgradeScenario(card), kind: null };
  const base = curatedBaseFor(cardId);
  if (base) {
    const curated = FACTORIES[base](cardId);
    const curatedReveals = curated.play.action.type === 'REVEAL_CHARACTER';
    if (eff?.type !== 'AMBUSH' || curatedReveals) return { scenario: curated, kind: null };
  }
  const p810 = phase810KindForEffect(cardId, effectIndex);
  if (p810) return { scenario: phase810Scenario(cardId, p810), kind: p810 };
  if (eff?.type) {
    const perEffect = buildScenarioForEffect(cardId, eff.type);
    if (perEffect) return { scenario: perEffect, kind: null };
    if (eff.type === 'AMBUSH') {
      const revealOnly = revealScenarioFor(cardId);
      if (revealOnly) return { scenario: revealOnly, kind: null };
    }
  }
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
