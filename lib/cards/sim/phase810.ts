import type { GameState, CharacterCard, CharacterInPlay, GameAction, PlayerID } from '@/lib/engine/types';
import { getCharacterById } from '@/lib/data/cardIndex';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { runScenario } from '@/lib/cards/sim/runScenario';
import { GameEngine } from '@/lib/engine/GameEngine';
import { calculateCharacterPower } from '@/lib/engine/phases/PowerCalculation';
import type { SimScenario } from '@/lib/cards/sim/scenarios';

const DECK_IDS = ['KS-021-C', 'KS-011-C', 'KS-007-C', 'KS-052-C'];
function deck(): CharacterCard[] { return DECK_IDS.map((id) => getCharacterById(id)!).filter(Boolean); }

const FRESH0: GameAction = { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false };
const PASS: GameAction = { type: 'PASS' };
const P1 = (a: GameAction) => ({ player: 'player1' as PlayerID, action: a });
const P2 = (a: GameAction) => ({ player: 'player2' as PlayerID, action: a });

function stripMissionEffects(state: GameState): void {
  for (const m of state.activeMissions) {
    m.card = { ...m.card, effects: [] } as typeof m.card;
  }
}

export function hasScoreEffect(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.type === 'SCORE');
}

function scoreBoard(card: CharacterCard, withCondition: boolean): GameState {
  const p1: CharacterInPlay[] = [
    simChar('KS-108-R', { owner: 'player1', instanceId: 'sc-anchor' }),
    simChar('KS-011-C', { owner: 'player1', instanceId: 'sc-ally' }),
  ];
  if (withCondition) p1.push(simChar('KS-078-UC', { owner: 'player1', instanceId: 'sc-sand' }));
  const p2: CharacterInPlay[] = [
    simChar('KS-005-C', { owner: 'player2', instanceId: 'sc-eweak', powerTokens: 1 }),
    simChar('KS-052-C', { owner: 'player2', instanceId: 'sc-ehidden', hidden: true }),
  ];
  const st = buildSimState({ hand1: [card.id], p1, p2, missions: 2, chakra1: 20, edgeHolder: 'player1' });
  st.activeMissions[1].player2Characters = [simChar('KS-108-R', { owner: 'player2', instanceId: 'sc-far', missionIndex: 1 })];
  stripMissionEffects(st);
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}

export function scoreScenario(card: CharacterCard): SimScenario {
  return {
    build: () => scoreBoard(card, true),
    play: P1(FRESH0),
    followups: [P2(PASS), P1(PASS)],
  };
}

function demoOf(state: GameState, cardId: string): CharacterInPlay | undefined {
  for (const m of state.activeMissions) for (const c of m.player1Characters) if (c.card.id === cardId) return c;
  return undefined;
}
function countChars(state: GameState, side: 'player1Characters' | 'player2Characters'): number {
  return state.activeMissions.reduce((n, m) => n + m[side].length, 0);
}

export function firesScore(card: CharacterCard): boolean {
  let states: GameState[];
  try { states = runScenario(scoreScenario(card)); } catch { return false; }
  const last = states[states.length - 1];
  if (last.pendingActions.length > 0) return false;
  const afterPlay = states.find((s) => demoOf(s, card.id)) ?? states[0];

  const demoBefore = demoOf(afterPlay, card.id);
  const demoAfter = demoOf(last, card.id);
  if (demoBefore && demoAfter && (demoBefore.missionIndex ?? 0) !== (demoAfter.missionIndex ?? 0)) return true;
  if (demoBefore && !demoAfter) return true;

  if (last.player1.hand.length > afterPlay.player1.hand.length) return true;
  if (countChars(last, 'player2Characters') < countChars(afterPlay, 'player2Characters')) return true;
  if (countChars(last, 'player1Characters') < countChars(afterPlay, 'player1Characters')) return true;

  for (const m of last.activeMissions) for (const c of [...m.player1Characters, ...m.player2Characters]) {
    if (c.card.id === card.id) continue;
    if (c.powerTokens > 0) return true;
  }

  const award = (afterPlay.activeMissions[0].basePoints ?? 2) + (afterPlay.activeMissions[0].rankBonus ?? 1);
  const gained = last.player1.missionPoints - afterPlay.player1.missionPoints;
  if (gained > award) return true;

  return false;
}

const AURA_ALLIES = ['KS-011-C', 'KS-009-C', 'KS-078-UC', 'KS-057-C', 'KS-076-UC', 'KS-040-C', 'KS-120-R', 'KS-003-C'];
const AURA_HIDDEN_ALLY = 'KS-052-C';
const AURA_ENEMIES = ['KS-005-C', 'KS-086-C', 'KS-017-C'];
const AURA_HIDDEN_ENEMY = 'KS-094-C';

function auraBoard(card: CharacterCard, includeDemo: boolean): GameState {
  const p1: CharacterInPlay[] = AURA_ALLIES
    .filter((id) => id !== card.id)
    .map((id, i) => simChar(id, { owner: 'player1', instanceId: `au-a${i}` }));
  if (AURA_HIDDEN_ALLY !== card.id) p1.push(simChar(AURA_HIDDEN_ALLY, { owner: 'player1', instanceId: 'au-ha', hidden: true }));
  const p2: CharacterInPlay[] = AURA_ENEMIES
    .filter((id) => id !== card.id)
    .map((id, i) => simChar(id, { owner: 'player2', instanceId: `au-e${i}`, powerTokens: i === 0 ? 2 : 0 }));
  if (AURA_HIDDEN_ENEMY !== card.id) p2.push(simChar(AURA_HIDDEN_ENEMY, { owner: 'player2', instanceId: 'au-he', hidden: true }));
  if (includeDemo) p1.push(simChar(card.id, { owner: 'player1', instanceId: 'au-demo' }));
  const st = buildSimState({ hand1: includeDemo ? [] : [card.id], p1, p2, missions: 2, chakra1: 20, edgeHolder: 'player1' });
  if (card.id !== 'KS-108-R') {
    st.activeMissions[1].player1Characters.push(simChar('KS-108-R', { owner: 'player1', instanceId: 'au-far-naruto', missionIndex: 1 }));
  }
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}

export function auraScenario(card: CharacterCard): SimScenario {
  return {
    build: () => auraBoard(card, false),
    play: P1(FRESH0),
  };
}

function powerMap(state: GameState): Map<string, number> {
  const m = new Map<string, number>();
  for (const mi of state.activeMissions) {
    for (const c of mi.player1Characters) m.set(c.instanceId, calculateCharacterPower(state, c, 'player1'));
    for (const c of mi.player2Characters) m.set(c.instanceId, calculateCharacterPower(state, c, 'player2'));
  }
  return m;
}

export function firesAura(card: CharacterCard): boolean {
  let full: GameState;
  let base: GameState;
  try {
    full = auraBoard(card, true);
    base = auraBoard(card, false);
  } catch { return false; }
  const pf = powerMap(full);
  const pb = powerMap(base);
  for (const [id, pv] of pb) {
    if (pf.has(id) && pf.get(id) !== pv) return true;
  }
  const demo = demoOf(full, card.id);
  if (demo) {
    const printed = (demo.card.power ?? 0) + demo.powerTokens;
    if (calculateCharacterPower(full, demo, 'player1') !== printed) return true;
  }
  return false;
}

const ADVANCE: GameAction = { type: 'ADVANCE_PHASE' };

function endBoard(card: CharacterCard): GameState {
  const p1: CharacterInPlay[] = [
    simChar('KS-108-R', { owner: 'player1', instanceId: 'er-anchor' }),
    simChar('KS-009-C', { owner: 'player1', instanceId: 'er-ally' }),
  ];
  const p2: CharacterInPlay[] = [
    simChar('KS-005-C', { owner: 'player2', instanceId: 'er-eweak' }),
    simChar('KS-052-C', { owner: 'player2', instanceId: 'er-ehidden', hidden: true }),
  ];
  const st = buildSimState({ hand1: [card.id], p1, p2, missions: 2, chakra1: 20, edgeHolder: 'player1' });
  st.activeMissions[1].player2Characters = [simChar('KS-108-R', { owner: 'player2', instanceId: 'er-far', missionIndex: 1 })];
  stripMissionEffects(st);
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}

export function endRoundScenario(card: CharacterCard): SimScenario {
  return {
    build: () => endBoard(card),
    play: P1(FRESH0),
    followups: [P2(PASS), P1(PASS), P1(ADVANCE)],
  };
}

interface Sig { p1Hand: number; p1Disc: number; p2Hand: number; p2Disc: number; hidden: number; chars: number; dist: string }
function signature(s: GameState): Sig {
  let hidden = 0, chars = 0;
  const cells: number[] = [];
  s.activeMissions.forEach((m) => {
    cells.push(m.player1Characters.length, m.player2Characters.length);
    for (const c of [...m.player1Characters, ...m.player2Characters]) { chars++; if (c.isHidden) hidden++; }
  });
  return {
    p1Hand: s.player1.hand.length, p1Disc: s.player1.discardPile.length,
    p2Hand: s.player2.hand.length, p2Disc: s.player2.discardPile.length,
    hidden, chars, dist: cells.join(','),
  };
}
function sigDiffers(a: Sig, b: Sig): boolean {
  return a.p1Hand !== b.p1Hand || a.p1Disc !== b.p1Disc || a.p2Hand !== b.p2Hand ||
    a.p2Disc !== b.p2Disc || a.hidden !== b.hidden || a.chars !== b.chars || a.dist !== b.dist;
}

export function hasEndRoundEffect(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) =>
    e.description.includes('[⧗]') && /end of (the )?round|fin de (la )?manche|fin du round/i.test(e.description));
}

function endBoardFor(demoId: string): GameState {
  const c = getCharacterById(demoId)!;
  return endBoard(c);
}
function endSignature(demoId: string): Sig | null {
  try {
    const states = runScenario({ build: () => endBoardFor(demoId), play: P1(FRESH0), followups: [P2(PASS), P1(PASS), P1(ADVANCE)] });
    const last = states[states.length - 1];
    if (last.pendingActions.length > 0) return null;
    return signature(last);
  } catch { return null; }
}

export function firesEndRound(card: CharacterCard): boolean {
  if (card.id === 'KS-086-C') return false;
  const full = endSignature(card.id);
  const base = endSignature('KS-086-C');
  if (!full || !base) return false;
  return sigDiffers(full, base);
}

const VANILLA = 'KS-086-C';

function chakraBoard(demoId: string): GameState {
  const p1: CharacterInPlay[] = [
    simChar('KS-108-R', { owner: 'player1', instanceId: 'ch-leaf' }),
    simChar('KS-057-C', { owner: 'player1', instanceId: 'ch-sf' }),
    simChar('KS-027-C', { owner: 'player1', instanceId: 'ch-akamaru' }),
  ].filter((c) => c.card.id !== demoId);
  const p2: CharacterInPlay[] = [simChar('KS-005-C', { owner: 'player2', instanceId: 'ch-e' })];
  const st = buildSimState({ hand1: [demoId], p1, p2, missions: 2, chakra1: 20, edgeHolder: 'player1' });
  st.activeMissions[1].player1Characters = [simChar('KS-059-C', { owner: 'player1', instanceId: 'ch-sf2', missionIndex: 1 })];
  stripMissionEffects(st);
  st.missionDeck = [];
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}

export function hasChakraStatic(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') && /chakra \+/i.test(e.description));
}

export function chakraScenario(card: CharacterCard): SimScenario {
  return { build: () => chakraBoard(card.id), play: P1(FRESH0), followups: [P2(PASS), P1(PASS), P1(ADVANCE)] };
}

function chakraAtNextStart(demoId: string): number | null {
  try {
    const states = runScenario(chakraScenario({ id: demoId } as CharacterCard));
    const last = states[states.length - 1];
    if (last.pendingActions.length > 0) return null;
    return last.player1.chakra;
  } catch { return null; }
}

export function firesChakra(card: CharacterCard): boolean {
  if (card.id === VANILLA) return false;
  const full = chakraAtNextStart(card.id);
  const base = chakraAtNextStart(VANILLA);
  if (full == null || base == null) return false;
  return full > base;
}

const DEFEAT_TOOL = 'KS-120-R';
const VICTIM = 'KS-017-C';
const ENEMY_BODY = 'KS-086-C';

function triggerBoard(demoId: string, opts: { victim?: boolean; hidden?: boolean } = {}): GameState {
  const p1: CharacterInPlay[] = [];
  if (opts.victim) p1.push(simChar(VICTIM, { owner: 'player1', instanceId: 'tr-victim' }));
  const st = buildSimState({ hand1: [demoId], p1, p2: [], missions: 2, chakra1: 18, edgeHolder: 'player1' });
  st.player2.hand = [getCharacterById(opts.hidden ? DEFEAT_TOOL : ENEMY_BODY)!];
  st.player2.chakra = 18;
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}

export function hasOnEnemyPlayed(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /when.*enemy.*(is )?played|enemy character is played/i.test(e.description));
}

export function onEnemyPlayedScenario(card: CharacterCard): SimScenario {
  return {
    build: () => triggerBoard(card.id),
    play: P1(FRESH0),
    followups: [P2(FRESH0)],
  };
}

export function firesOnEnemyPlayed(card: CharacterCard): boolean {
  try {
    const played = runScenario({ build: () => triggerBoard(card.id), play: P1(FRESH0) });
    const afterPlay = played[played.length - 1];
    if (afterPlay.pendingActions.length > 0) return false;
    const full = runScenario(onEnemyPlayedScenario(card));
    const last = full[full.length - 1];
    if (last.pendingActions.length > 0) return false;
    if (last.player1.chakra !== afterPlay.player1.chakra) return true;
    const demoBefore = demoOf(afterPlay, card.id);
    const demoAfter = demoOf(last, card.id);
    if (demoBefore && demoAfter && calculateCharacterPower(last, demoAfter, 'player1') !== calculateCharacterPower(afterPlay, demoBefore, 'player1')) return true;
    return false;
  } catch { return false; }
}

export function hasProtect(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /would be (defeated|moved|hidden)[^.]*(hide|defeat)|if this character would be defeated/i.test(e.description));
}

const HIDE_DEFEAT_TOOL = 'KS-119-R';

const PROTECT_BASE = 'KS-009-C';

function protectBoard(demoId: string): GameState {
  const p1: CharacterInPlay[] = [simChar('KS-108-R', { owner: 'player1', instanceId: 'pr-leaf' })];
  const st = buildSimState({ hand1: [demoId], p1, p2: [], missions: 2, chakra1: 18, edgeHolder: 'player1' });
  st.player2.hand = [getCharacterById(HIDE_DEFEAT_TOOL)!];
  st.player2.chakra = 18;
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}

export function protectScenario(card: CharacterCard): SimScenario {
  return { build: () => protectBoard(card.id), play: P1(FRESH0), followups: [P2(FRESH0)] };
}

function protectOutcome(demoId: string): { present: boolean; hidden: boolean } | null {
  try {
    const states = runScenario(protectScenario({ id: demoId } as CharacterCard));
    const last = states[states.length - 1];
    if (last.pendingActions.length > 0) return null;
    const demo = demoOf(last, demoId);
    return { present: !!demo, hidden: !!demo?.isHidden };
  } catch { return null; }
}

export function firesProtect(card: CharacterCard): boolean {
  if (card.id === PROTECT_BASE) return false;
  const full = protectOutcome(card.id);
  const base = protectOutcome(PROTECT_BASE);
  if (!full || !base) return false;
  if (full.hidden && !base.hidden) return true;
  return full.present && !base.present;
}

const UPGRADE_OVER_CANDIDATES = ['KS-057-C', 'KS-075-C', 'KS-108-R', 'KS-009-C', 'KS-063-UC', 'KS-025-C', 'KS-027-C', 'KS-052-C'];

export function hasUpgradeOver(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /upgrade[^.]*over|as an upgrade to|jouer[^.]*(comme )?amélioration/i.test(e.description));
}

const UPGRADE_ACTION = (target: string): GameAction => ({ type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: target });

function upgradeOverBoardWith(demoId: string, baseId: string): GameState {
  const p1: CharacterInPlay[] = [simChar(baseId, { owner: 'player1', instanceId: 'uo-base' })];
  const st = buildSimState({ hand1: [demoId], p1, p2: [], missions: 2, chakra1: 20, edgeHolder: 'player1' });
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}

function workingUpgradeBase(card: CharacterCard): string | null {
  if (!hasUpgradeOver(card)) return null;
  for (const baseId of UPGRADE_OVER_CANDIDATES) {
    if (baseId === card.id) continue;
    try {
      const states = runScenario({ build: () => upgradeOverBoardWith(card.id, baseId), play: P1(UPGRADE_ACTION('uo-base')) });
      const last = states[states.length - 1];
      if (last.pendingActions.length > 0) continue;
      const demo = demoOf(last, card.id);
      if (demo && (demo.stack?.length ?? 0) >= 2) return baseId;
    } catch { /* try next */ }
  }
  return null;
}

export function upgradeOverScenario(card: CharacterCard): SimScenario {
  const baseId = workingUpgradeBase(card) ?? UPGRADE_OVER_CANDIDATES[0];
  return { build: () => upgradeOverBoardWith(card.id, baseId), play: P1(UPGRADE_ACTION('uo-base')) };
}

export function firesUpgradeOver(card: CharacterCard): boolean {
  return workingUpgradeBase(card) !== null;
}

export function hasPowerAura(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /power|puissance/i.test(e.description) &&
    (/[+\-]\s?\d/.test(e.description) || /set to 0|loses all power|power set to|puissance[^.]*0|réduite à 0/i.test(e.description)));
}
export function hasProtectStatic(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /would be (defeated|moved|hidden)|can'?t be (hidden|defeated)|cannot be (defeated|hidden)|si (ce personnage|un personnage)[^.]*(vaincu|caché|déplacé)|ne peut[^.]*(être )?(caché|vaincu)/i.test(e.description));
}

export function hasAllyCostReduction(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /other[^.]*cost[^.]*less|autres[^.]*coûtent[^.]*moins/i.test(e.description));
}
function costModBoard(demoOrVanilla: string): GameState {
  const st = buildSimState({ hand1: [demoOrVanilla, 'KS-025-C'], p1: [], p2: [], missions: 2, chakra1: 20, edgeHolder: 'player1' });
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}
export function costModScenario(card: CharacterCard): SimScenario {
  return { build: () => costModBoard(card.id), play: P1(FRESH0), followups: [P2(PASS), P1(FRESH0)] };
}
function costModChakra(demoOrVanilla: string): number | null {
  try {
    const states = runScenario({ build: () => costModBoard(demoOrVanilla), play: P1(FRESH0), followups: [P2(PASS), P1(FRESH0)] });
    const last = states[states.length - 1];
    if (last.pendingActions.length > 0) return null;
    return last.player1.chakra;
  } catch { return null; }
}
export function firesCostMod(card: CharacterCard): boolean {
  if (card.id === VANILLA || card.id === 'KS-025-C') return false;
  const full = costModChakra(card.id);
  const base = costModChakra(VANILLA);
  return full != null && base != null && full > base;
}

const SASUKE = 'KS-013-C';
export function hasHiddenCostReduction(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /while hidden paying|caché en payant|hidden[^.]*less/i.test(e.description));
}
function hiddenCostBoard(demoId: string, withCondition: boolean): GameState {
  const p1: CharacterInPlay[] = [simChar(demoId, { owner: 'player1', instanceId: 'hc-demo', hidden: true })];
  if (withCondition && SASUKE !== demoId) p1.push(simChar(SASUKE, { owner: 'player1', instanceId: 'hc-sasuke' }));
  const st = buildSimState({ hand1: [], p1, p2: [], missions: 2, chakra1: 20, edgeHolder: 'player1' });
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}
const REVEAL_HC: GameAction = { type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'hc-demo' };
export function hiddenCostScenario(card: CharacterCard): SimScenario {
  return { build: () => hiddenCostBoard(card.id, true), play: { player: 'player1', action: REVEAL_HC } };
}
function hiddenCostChakra(demoId: string, withCond: boolean): number | null {
  try {
    const states = runScenario({ build: () => hiddenCostBoard(demoId, withCond), play: { player: 'player1', action: REVEAL_HC } });
    const last = states[states.length - 1];
    if (last.pendingActions.length > 0) return null;
    return last.player1.chakra;
  } catch { return null; }
}
export function firesHiddenCost(card: CharacterCard): boolean {
  const withC = hiddenCostChakra(card.id, true);
  if (withC == null) return false;
  const spent = 20 - withC;
  return spent < (card.chakra ?? 0);
}

export function hasSelfCostReduction(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /(pay \d less to play|play this[^.]*paying \d less)/i.test(e.description));
}
function selfCostBoard(demoId: string): GameState {
  const p1: CharacterInPlay[] = [simChar('KS-108-R', { owner: 'player1', instanceId: 'sc-naruto' })].filter((c) => c.card.id !== demoId);
  const p2: CharacterInPlay[] = [simChar('KS-075-C', { owner: 'player2', instanceId: 'sc-jutsu' })];
  const st = buildSimState({ hand1: [demoId], p1, p2, missions: 2, chakra1: 20, edgeHolder: 'player1' });
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}
function selfCostRevealBoard(demoId: string): GameState {
  const p1: CharacterInPlay[] = [
    simChar(demoId, { owner: 'player1', instanceId: 'sc-demo', hidden: true }),
    simChar('KS-108-R', { owner: 'player1', instanceId: 'sc-naruto' }),
  ].filter((c, i) => i === 0 || c.card.id !== demoId);
  const p2: CharacterInPlay[] = [simChar('KS-075-C', { owner: 'player2', instanceId: 'sc-jutsu' })];
  const st = buildSimState({ hand1: [], p1, p2, missions: 2, chakra1: 20, edgeHolder: 'player1' });
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}
const SELFCOST_REVEAL: GameAction = { type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'sc-demo' };
function selfCostFreshSpent(card: CharacterCard): number | null {
  try {
    const last = runScenario(selfCostScenarioFresh(card)).slice(-1)[0];
    if (last.pendingActions.length > 0 || !demoOf(last, card.id)) return null;
    return 20 - last.player1.chakra;
  } catch { return null; }
}
function selfCostRevealSpent(card: CharacterCard): number | null {
  try {
    const last = runScenario({ build: () => selfCostRevealBoard(card.id), play: { player: 'player1', action: SELFCOST_REVEAL } }).slice(-1)[0];
    if (last.pendingActions.length > 0) return null;
    const demo = last.activeMissions.flatMap((m) => m.player1Characters).find((c) => c.instanceId === 'sc-demo');
    if (!demo || demo.isHidden) return null;
    return 20 - last.player1.chakra;
  } catch { return null; }
}
function selfCostScenarioFresh(card: CharacterCard): SimScenario {
  return { build: () => selfCostBoard(card.id), play: P1(FRESH0) };
}
export function selfCostScenario(card: CharacterCard): SimScenario {
  const fresh = selfCostFreshSpent(card);
  if (fresh != null && fresh < (card.chakra ?? 0)) return selfCostScenarioFresh(card);
  return { build: () => selfCostRevealBoard(card.id), play: { player: 'player1', action: SELFCOST_REVEAL } };
}
export function firesSelfCost(card: CharacterCard): boolean {
  const printed = card.chakra ?? 0;
  const fresh = selfCostFreshSpent(card);
  if (fresh != null && fresh < printed) return true;
  const rev = selfCostRevealSpent(card);
  return rev != null && rev < printed;
}

export function hasOnAffected(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /if this character is affected by an enemy effect|si ce personnage est affecté/i.test(e.description));
}
function onAffectedBoard(demoOrVanilla: string): GameState {
  const p1: CharacterInPlay[] = [simChar(demoOrVanilla, { owner: 'player1', instanceId: 'oa-demo' })];
  const p2: CharacterInPlay[] = [simChar(IMMUNITY_HIDE_TOOL, { owner: 'player2', instanceId: 'oa-tool', hidden: true })];
  const st = buildSimState({ hand1: [], p1, p2, missions: 2, chakra1: 18, edgeHolder: 'player1' });
  st.player2.chakra = 18;
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}
const ONAFFECTED_REVEAL: GameAction = { type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'oa-tool' };
export function onAffectedScenario(card: CharacterCard): SimScenario {
  return { build: () => onAffectedBoard(card.id), play: P1(PASS), followups: [{ player: 'player2', action: ONAFFECTED_REVEAL }] };
}
function onAffectedP2Chakra(demoOrVanilla: string): number | null {
  try {
    const last = runScenario({ build: () => onAffectedBoard(demoOrVanilla), play: P1(PASS), followups: [{ player: 'player2', action: ONAFFECTED_REVEAL }] }).slice(-1)[0];
    if (last.pendingActions.length > 0) return null;
    return last.player2.chakra;
  } catch { return null; }
}
export function firesOnAffected(card: CharacterCard): boolean {
  if (card.id === VANILLA || card.id === IMMUNITY_HIDE_TOOL) return false;
  const full = onAffectedP2Chakra(card.id);
  const base = onAffectedP2Chakra(VANILLA);
  return full != null && base != null && full < base;
}

export function hasWinRestriction(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /only in a mission where you are (currently )?winning|uniquement dans une mission où vous (êtes|gagnez)/i.test(e.description));
}
function winRestrictionBoards(demoId: string): { winMission: GameState; loseMission: GameState } {
  const build = (winIdx: number, loseIdx: number): GameState => {
    const st = buildSimState({ hand1: [demoId], p1: [simChar('KS-108-R', { owner: 'player1', instanceId: 'wr-anchor', missionIndex: winIdx })], p2: [], missions: 2, chakra1: 20, edgeHolder: 'player1' });
    st.activeMissions[winIdx].player1Characters = [simChar('KS-108-R', { owner: 'player1', instanceId: 'wr-anchor', missionIndex: winIdx })];
    st.activeMissions[loseIdx].player1Characters = [];
    st.activeMissions[loseIdx].player2Characters = [simChar('KS-108-R', { owner: 'player2', instanceId: 'wr-enemy', missionIndex: loseIdx })];
    st.player1.deck = deck(); st.player2.deck = deck();
    return st;
  };
  return { winMission: build(0, 1), loseMission: build(1, 0) };
}
export function winRestrictionScenario(card: CharacterCard): SimScenario {
  return { build: () => winRestrictionBoards(card.id).winMission, play: P1(FRESH0) };
}
export function firesWinRestriction(card: CharacterCard): boolean {
  const boards = winRestrictionBoards(card.id);
  try {
    const okStates = runScenario({ build: () => boards.winMission, play: P1(FRESH0) });
    const okLast = okStates[okStates.length - 1];
    const playedOnWin = !!demoOf(okLast, card.id);
    const blockedStates = runScenario({ build: () => boards.loseMission, play: P1(FRESH0) });
    const blockedLast = blockedStates[blockedStates.length - 1];
    const playedOnLose = !!demoOf(blockedLast, card.id);
    return playedOnWin && !playedOnLose;
  } catch { return false; }
}

export function hasSacrificeProtect(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /friendly[^.]*would be (hidden|defeated)[^.]*defeat this|défausser ce personnage/i.test(e.description));
}
function sacrificeBoard(demoOrNull: string | null): GameState {
  const p1: CharacterInPlay[] = [simChar('KS-011-C', { owner: 'player1', instanceId: 'sa-leaf' })];
  const st = buildSimState({ hand1: demoOrNull ? [demoOrNull] : [], p1, p2: [], missions: 2, chakra1: 18, edgeHolder: 'player1' });
  st.player2.hand = [getCharacterById(HIDE_DEFEAT_TOOL)!];
  st.player2.chakra = 18;
  st.player1.deck = deck(); st.player2.deck = deck();
  return st;
}
export function sacrificeScenario(card: CharacterCard): SimScenario {
  return { build: () => sacrificeBoard(card.id), play: P1(FRESH0), followups: [P2(FRESH0)] };
}
function leafSurvives(demoId: string): boolean | null {
  try {
    const states = runScenario(sacrificeScenario({ id: demoId } as CharacterCard));
    const last = states[states.length - 1];
    if (last.pendingActions.length > 0) return null;
    return last.activeMissions.some((m) => m.player1Characters.some((c) => c.instanceId === 'sa-leaf'));
  } catch { return null; }
}
export function firesSacrifice(card: CharacterCard): boolean {
  if (card.id === VANILLA) return false;
  const withDemo = leafSurvives(card.id);
  const without = leafSurvives(VANILLA);
  return withDemo === true && without === false;
}

const MOVE_TOOL = 'KS-121-R';
export function hasOnMoveLook(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /when this character moves|lorsque ce personnage[^.]*déplace/i.test(e.description));
}
function onMoveBoard(demoId: string): GameState {
  const p1: CharacterInPlay[] = [simChar(demoId, { owner: 'player1', instanceId: 'om-demo', missionIndex: 0 })];
  const st = buildSimState({ hand1: [MOVE_TOOL], p1, p2: [], missions: 2, chakra1: 20, edgeHolder: 'player1' });
  st.activeMissions[1].player2Characters = [simChar('KS-052-C', { owner: 'player2', instanceId: 'om-hidden', missionIndex: 1, hidden: true })];
  st.player1.deck = deck(); st.player2.deck = deck();
  return st;
}
const moveChoose = (state: GameState, pending: { options?: string[] }): string[] => {
  const opts = pending.options ?? [];
  if (opts.includes('om-demo')) return ['om-demo'];
  if (opts.includes('1')) return ['1'];
  if (opts.includes('om-hidden')) return ['om-hidden'];
  return opts.slice(0, 1);
};
export function onMoveScenario(card: CharacterCard): SimScenario {
  return { build: () => onMoveBoard(card.id), play: P1(FRESH0), choose: moveChoose };
}
export function firesOnMove(card: CharacterCard): boolean {
  try {
    const states = runScenario(onMoveScenario(card));
    const last = states[states.length - 1];
    if (last.pendingActions.length > 0) return false;
    const demo = demoOf(last, card.id);
    return !!demo && (demo.missionIndex ?? 0) === 1;
  } catch { return false; }
}

const GAARA_TOOL = 'KS-120-R';
function defeatVictimBoard(demoId: string): GameState {
  const p1: CharacterInPlay[] = [simChar(demoId, { owner: 'player1', instanceId: 'ad-demo' }), simChar('KS-017-C', { owner: 'player1', instanceId: 'ad-victim' })];
  const st = buildSimState({ hand1: [], p1, p2: [], missions: 2, chakra1: 18, edgeHolder: 'player1' });
  st.player2.hand = [getCharacterById(GAARA_TOOL)!];
  st.player2.chakra = 18;
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}
export function hasOnAnyDefeat(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /when (a|any)[^.]*character is defeated|defeated friendly characters go into|lorsqu'un personnage[^.]*vaincu|personnages? alliés? vaincus?/i.test(e.description));
}
export function onAnyDefeatScenario(card: CharacterCard): SimScenario {
  return { build: () => defeatVictimBoard(card.id), play: P1(PASS), followups: [P2(FRESH0)] };
}
export function firesOnAnyDefeat(card: CharacterCard): boolean {
  if (card.id === 'KS-017-C' || card.id === GAARA_TOOL) return false;
  try {
    const before = defeatVictimBoard(card.id);
    const states = runScenario(onAnyDefeatScenario(card));
    const last = states[states.length - 1];
    if (last.pendingActions.length > 0) return false;
    const victimGone = !last.activeMissions.some((m) => m.player1Characters.some((c) => c.instanceId === 'ad-victim'));
    if (!victimGone) return false;
    return last.player1.chakra > before.player1.chakra || last.player1.hand.length > 0 || last.player1.deck.length !== before.player1.deck.length;
  } catch { return false; }
}

function penaltyBoard(demoOrVanilla: string, reveal: boolean): GameState {
  const p1: CharacterInPlay[] = [simChar(demoOrVanilla, { owner: 'player1', instanceId: 'pen-demo' })];
  const p2: CharacterInPlay[] = reveal ? [simChar('KS-086-C', { owner: 'player2', instanceId: 'pen-e', hidden: true })] : [];
  const st = buildSimState({ hand1: [], p1, p2, missions: 2, chakra1: 18, edgeHolder: 'player1' });
  st.player2.hand = reveal ? [] : [getCharacterById('KS-086-C')!];
  st.player2.chakra = 18;
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}
export function hasEnemyCostPenalty(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /enemy[^.]*(cost[^.]*(additional|more|\+ ?1)|pay \d more)|opponent must pay \d more|pay \d more[^.]*reveal|coûtent[^.]*de plus|payer \d de plus/i.test(e.description));
}
function isRevealPenalty(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') && /reveal/i.test(e.description) && /more|additional|\+ ?1/i.test(e.description));
}
function penaltyFollowup(reveal: boolean) {
  return reveal
    ? { player: 'player2' as PlayerID, action: { type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'pen-e' } as GameAction }
    : P2(FRESH0);
}
function penaltyChakra(demoOrVanilla: string, reveal: boolean): number | null {
  try {
    const states = runScenario({ build: () => penaltyBoard(demoOrVanilla, reveal), play: P1(PASS), followups: [penaltyFollowup(reveal)] });
    const last = states[states.length - 1];
    if (last.pendingActions.length > 0) return null;
    return last.player2.chakra;
  } catch { return null; }
}
export function costPenaltyScenario(card: CharacterCard): SimScenario {
  const reveal = isRevealPenalty(card);
  return { build: () => penaltyBoard(card.id, reveal), play: P1(PASS), followups: [penaltyFollowup(reveal)] };
}
export function firesCostPenalty(card: CharacterCard): boolean {
  const reveal = isRevealPenalty(card);
  const full = penaltyChakra(card.id, reveal);
  const base = penaltyChakra(VANILLA, reveal);
  return full != null && base != null && full < base;
}

function persistBoard(demoOrVanilla: string): GameState {
  const p1: CharacterInPlay[] = [
    simChar('KS-108-R', { owner: 'player1', instanceId: 'tp-anchor' }),
    simChar(demoOrVanilla, { owner: 'player1', instanceId: 'tp-demo', powerTokens: 2 }),
  ];
  const p2: CharacterInPlay[] = [simChar('KS-005-C', { owner: 'player2', instanceId: 'tp-e' })];
  const st = buildSimState({ hand1: [], p1, p2, missions: 2, chakra1: 18, edgeHolder: 'player1' });
  st.activeMissions[1].player2Characters = [simChar('KS-108-R', { owner: 'player2', instanceId: 'tp-far', missionIndex: 1 })];
  stripMissionEffects(st);
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}
export function hasTokenPersist(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /doesn'?t lose[^.]*power token|ne perd[^.]*jeton/i.test(e.description));
}
export function tokenPersistScenario(card: CharacterCard): SimScenario {
  return { build: () => persistBoard(card.id), play: P1(PASS), followups: [P2(PASS), P1(ADVANCE)] };
}
function demoTokensAfterEnd(demoOrVanilla: string): number | null {
  try {
    const states = runScenario(tokenPersistScenario({ id: demoOrVanilla } as CharacterCard));
    const last = states[states.length - 1];
    if (last.pendingActions.length > 0) return null;
    const demo = last.activeMissions.flatMap((m) => m.player1Characters).find((c) => c.instanceId === 'tp-demo');
    return demo ? demo.powerTokens : null;
  } catch { return null; }
}
export function firesTokenPersist(card: CharacterCard): boolean {
  const full = demoTokensAfterEnd(card.id);
  const base = demoTokensAfterEnd(VANILLA);
  return full != null && base != null && full > base;
}

function scoringLossBoard(demoId: string): GameState {
  const p1: CharacterInPlay[] = [simChar(demoId, { owner: 'player1', instanceId: 'sl-demo' })];
  const p2: CharacterInPlay[] = [simChar('KS-108-R', { owner: 'player2', instanceId: 'sl-e1' }), simChar('KS-115-R', { owner: 'player2', instanceId: 'sl-e2' })];
  const st = buildSimState({ hand1: [], p1, p2, missions: 2, chakra1: 18, edgeHolder: 'player2' });
  st.activeMissions[1].player1Characters = [];
  stripMissionEffects(st);
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}
export function hasScoringMove(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /lost this mission[^.]*(move|déplac)|perdu cette mission[^.]*déplac/i.test(e.description));
}
export function scoringMoveScenario(card: CharacterCard): SimScenario {
  return { build: () => scoringLossBoard(card.id), play: P1(PASS), followups: [P2(PASS)] };
}
export function firesScoringMove(card: CharacterCard): boolean {
  try {
    const states = runScenario(scoringMoveScenario(card));
    const last = states[states.length - 1];
    if (last.pendingActions.length > 0) return false;
    const demo = last.activeMissions.flatMap((m) => m.player1Characters).find((c) => c.instanceId === 'sl-demo');
    return !!demo && (demo.missionIndex ?? 0) !== 0;
  } catch { return false; }
}

const IMMUNITY_HIDE_TOOL = 'KS-026-UC';
function immunityBoard(demoOrVanilla: string): GameState {
  const p1: CharacterInPlay[] = [simChar(demoOrVanilla, { owner: 'player1', instanceId: 'im-demo' })];
  const p2: CharacterInPlay[] = [simChar(IMMUNITY_HIDE_TOOL, { owner: 'player2', instanceId: 'im-tool', hidden: true })];
  const st = buildSimState({ hand1: [], p1, p2, missions: 2, chakra1: 18, edgeHolder: 'player1' });
  st.player2.chakra = 18;
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}
export function hasImmunity(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /can'?t be (hidden|defeated)|cannot be (defeated|hidden)|ne peut[^.]*(être )?(caché|vaincu)/i.test(e.description));
}
const IMMUNITY_REVEAL: GameAction = { type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'im-tool' };
export function immunityScenario(card: CharacterCard): SimScenario {
  return { build: () => immunityBoard(card.id), play: P1(PASS), followups: [{ player: 'player2', action: IMMUNITY_REVEAL }] };
}
function immunityOutcome(demoOrVanilla: string): { present: boolean; hidden: boolean } | null {
  try {
    const states = runScenario({ build: () => immunityBoard(demoOrVanilla), play: P1(PASS), followups: [{ player: 'player2', action: IMMUNITY_REVEAL }] });
    const last = states[states.length - 1];
    if (last.pendingActions.length > 0) return null;
    const demo = last.activeMissions.flatMap((m) => m.player1Characters).find((c) => c.instanceId === 'im-demo');
    return { present: !!demo, hidden: !!demo?.isHidden };
  } catch { return null; }
}
export function firesImmunity(card: CharacterCard): boolean {
  if (card.id === VANILLA || card.id === IMMUNITY_HIDE_TOOL) return false;
  const full = immunityOutcome(card.id);
  const base = immunityOutcome(VANILLA);
  if (!full || !base) return false;
  return full.present && !full.hidden && base.hidden;
}

const MOVE_TOOL_ENEMY = 'KS-121-R';
function moveBlockBoard(demoOrVanilla: string): GameState {
  const p1: CharacterInPlay[] = [simChar(demoOrVanilla, { owner: 'player1', instanceId: 'mb-demo' })];
  const p2: CharacterInPlay[] = [simChar('KS-005-C', { owner: 'player2', instanceId: 'mb-e' })];
  const st = buildSimState({ hand1: [], p1, p2, missions: 2, chakra1: 18, edgeHolder: 'player1' });
  st.player2.hand = [getCharacterById(MOVE_TOOL_ENEMY)!];
  st.player2.chakra = 18;
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}
const mbChoose = (state: GameState, pending: { options?: string[] }): string[] => {
  const o = pending.options ?? [];
  if (o.includes('mb-e')) return ['mb-e'];
  if (o.includes('1')) return ['1'];
  return o.slice(0, 1);
};
export function hasMoveOutBlock(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /enemy[^.]*cannot move (from|out of) this mission|ennemis?[^.]*ne peuvent[^.]*quitter/i.test(e.description));
}
export function moveBlockScenario(card: CharacterCard): SimScenario {
  return { build: () => moveBlockBoard(card.id), play: P1(PASS), followups: [P2(FRESH0)], choose: mbChoose };
}
function enemyMissionAfterMoveAttempt(demoOrVanilla: string): number | null {
  try {
    const states = runScenario({ build: () => moveBlockBoard(demoOrVanilla), play: P1(PASS), followups: [P2(FRESH0)], choose: mbChoose });
    const last = states[states.length - 1];
    if (last.pendingActions.length > 0) return null;
    const e = last.activeMissions.flatMap((m) => m.player2Characters).find((c) => c.instanceId === 'mb-e');
    return e ? (e.missionIndex ?? 0) : null;
  } catch { return null; }
}
export function firesMoveBlock(card: CharacterCard): boolean {
  if (card.id === VANILLA) return false;
  const full = enemyMissionAfterMoveAttempt(card.id);
  const base = enemyMissionAfterMoveAttempt(VANILLA);
  return full != null && base != null && full === 0 && base !== 0;
}

function revealBlockBoard(demoOrVanilla: string): GameState {
  const p1: CharacterInPlay[] = [simChar(demoOrVanilla, { owner: 'player1', instanceId: 'rb-demo' })];
  const p2: CharacterInPlay[] = [simChar('KS-086-C', { owner: 'player2', instanceId: 'rb-e', hidden: true })];
  const st = buildSimState({ hand1: [], p1, p2, missions: 2, chakra1: 18, edgeHolder: 'player1' });
  st.player2.chakra = 18;
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}
export function hasRevealBlock(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /opponent cannot play characters while hidden|cannot reveal|ne peut[^.]*révéler/i.test(e.description));
}
const REVEAL_RB: GameAction = { type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'rb-e' };
export function revealBlockScenario(card: CharacterCard): SimScenario {
  return { build: () => revealBlockBoard(card.id), play: P1(PASS), followups: [{ player: 'player2', action: REVEAL_RB }] };
}
function enemyHiddenAfterRevealAttempt(demoOrVanilla: string): boolean | null {
  try {
    const states = runScenario({ build: () => revealBlockBoard(demoOrVanilla), play: P1(PASS), followups: [{ player: 'player2', action: REVEAL_RB }] });
    const last = states[states.length - 1];
    if (last.pendingActions.length > 0) return null;
    const e = last.activeMissions.flatMap((m) => m.player2Characters).find((c) => c.instanceId === 'rb-e');
    return e ? e.isHidden : null;
  } catch { return null; }
}
export function firesRevealBlock(card: CharacterCard): boolean {
  if (card.id === VANILLA) return false;
  const full = enemyHiddenAfterRevealAttempt(card.id);
  const base = enemyHiddenAfterRevealAttempt(VANILLA);
  return full === true && base === false;
}

const HIDE_ENEMY_TOOL = 'KS-108-R';
function hideAllyBlockBoard(demoOrVanilla: string): GameState {
  const p1: CharacterInPlay[] = [
    simChar(demoOrVanilla, { owner: 'player1', instanceId: 'hab-demo' }),
    simChar('KS-011-C', { owner: 'player1', instanceId: 'hab-ally' }),
  ];
  const st = buildSimState({ hand1: [], p1, p2: [], missions: 2, chakra1: 18, edgeHolder: 'player1' });
  st.player2.hand = [getCharacterById(HIDE_ENEMY_TOOL)!];
  st.player2.chakra = 18;
  st.player1.deck = deck();
  st.player2.deck = deck();
  return st;
}
const habChoose = (state: GameState, pending: { options?: string[] }): string[] => {
  const o = pending.options ?? [];
  if (o.includes('hab-ally')) return ['hab-ally'];
  return o.slice(0, 1);
};
export function hasHideAllyBlock(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.description.includes('[⧗]') &&
    /friendly[^.]*cannot be hidden|alliés?[^.]*ne peuvent[^.]*caché/i.test(e.description));
}
export function hideAllyBlockScenario(card: CharacterCard): SimScenario {
  return { build: () => hideAllyBlockBoard(card.id), play: P1(PASS), followups: [P2(FRESH0)], choose: habChoose };
}
function allyHiddenAfterHideAttempt(demoOrVanilla: string): boolean | null {
  try {
    const states = runScenario({ build: () => hideAllyBlockBoard(demoOrVanilla), play: P1(PASS), followups: [P2(FRESH0)], choose: habChoose });
    const last = states[states.length - 1];
    if (last.pendingActions.length > 0) return null;
    const a = last.activeMissions.flatMap((m) => m.player1Characters).find((c) => c.instanceId === 'hab-ally');
    return a ? a.isHidden : null;
  } catch { return null; }
}
export function firesHideAllyBlock(card: CharacterCard): boolean {
  if (card.id === VANILLA) return false;
  const full = allyHiddenAfterHideAttempt(card.id);
  const base = allyHiddenAfterHideAttempt(VANILLA);
  return full === false && base === true;
}

export type Phase810Kind = 'score' | 'aura' | 'endround' | 'chakra' | 'onenemy' | 'protect' | 'upgradeover' | 'costmod' | 'hiddencost' | 'winrestrict' | 'sacrifice' | 'onmove' | 'selfcost' | 'onanydefeat' | 'costpenalty' | 'tokenpersist' | 'scoringmove' | 'immunity' | 'moveblock' | 'revealblock' | 'hideallyblock' | 'onaffected';

export function phase810ScenarioKind(cardId: string): Phase810Kind | null {
  const card = getCharacterById(cardId);
  if (!card) return null;
  if (hasScoreEffect(card) && firesScore(card)) return 'score';
  if (hasUpgradeOver(card) && firesUpgradeOver(card)) return 'upgradeover';
  if (hasPowerAura(card) && firesAura(card)) return 'aura';
  if (hasEndRoundEffect(card) && firesEndRound(card)) return 'endround';
  if (hasChakraStatic(card) && firesChakra(card)) return 'chakra';
  if (hasOnEnemyPlayed(card) && firesOnEnemyPlayed(card)) return 'onenemy';
  if (hasProtectStatic(card) && firesProtect(card)) return 'protect';
  if (hasAllyCostReduction(card) && firesCostMod(card)) return 'costmod';
  if (hasHiddenCostReduction(card) && firesHiddenCost(card)) return 'hiddencost';
  if (hasWinRestriction(card) && firesWinRestriction(card)) return 'winrestrict';
  if (hasSacrificeProtect(card) && firesSacrifice(card)) return 'sacrifice';
  if (hasOnMoveLook(card) && firesOnMove(card)) return 'onmove';
  if (hasSelfCostReduction(card) && firesSelfCost(card)) return 'selfcost';
  if (hasOnAnyDefeat(card) && firesOnAnyDefeat(card)) return 'onanydefeat';
  if (hasEnemyCostPenalty(card) && firesCostPenalty(card)) return 'costpenalty';
  if (hasTokenPersist(card) && firesTokenPersist(card)) return 'tokenpersist';
  if (hasScoringMove(card) && firesScoringMove(card)) return 'scoringmove';
  if (hasImmunity(card) && firesImmunity(card)) return 'immunity';
  if (hasMoveOutBlock(card) && firesMoveBlock(card)) return 'moveblock';
  if (hasRevealBlock(card) && firesRevealBlock(card)) return 'revealblock';
  if (hasHideAllyBlock(card) && firesHideAllyBlock(card)) return 'hideallyblock';
  if (hasOnAffected(card) && firesOnAffected(card)) return 'onaffected';
  return null;
}

export function phase810Fires(cardId: string): boolean {
  return phase810ScenarioKind(cardId) !== null;
}

export function phase810KindForEffect(cardId: string, effectIndex: number): Phase810Kind | null {
  const card = getCharacterById(cardId);
  if (!card) return null;
  const e = (card.effects ?? [])[effectIndex];
  if (!e) return null;
  if (e.type === 'SCORE') return hasScoreEffect(card) && firesScore(card) ? 'score' : null;
  const d = e.description;
  if (!d.includes('[⧗]')) return null;
  if (/upgrade[^.]*over|as an upgrade to|amélioration/i.test(d) && firesUpgradeOver(card)) return 'upgradeover';
  if (/power|puissance/i.test(d) && (/[+\-]\s?\d/.test(d) || /set to 0|loses all power|power set to|réduite à 0/i.test(d)) && firesAura(card)) return 'aura';
  if (/end of (the )?round|fin de (la )?manche|fin du round/i.test(d) && firesEndRound(card)) return 'endround';
  if (/chakra \+/i.test(d) && firesChakra(card)) return 'chakra';
  if (/when.*enemy.*(is )?played/i.test(d) && firesOnEnemyPlayed(card)) return 'onenemy';
  if (/friendly[^.]*would be (hidden|defeated)/i.test(d) && firesSacrifice(card)) return 'sacrifice';
  if (/would be (defeated|moved|hidden)/i.test(d) && firesProtect(card)) return 'protect';
  if (/other[^.]*cost[^.]*less|autres[^.]*coûtent[^.]*moins/i.test(d) && firesCostMod(card)) return 'costmod';
  if (/while hidden paying|caché en payant|hidden[^.]*less/i.test(d) && firesHiddenCost(card)) return 'hiddencost';
  if (/only in a mission where you are/i.test(d) && firesWinRestriction(card)) return 'winrestrict';
  if (/when this character moves|lorsque ce personnage[^.]*déplace/i.test(d) && firesOnMove(card)) return 'onmove';
  if (/(pay \d less to play|play this[^.]*paying \d less)/i.test(d) && firesSelfCost(card)) return 'selfcost';
  if (/when (a|any)[^.]*character is defeated|defeated friendly characters go into|lorsqu'un personnage[^.]*vaincu/i.test(d) && firesOnAnyDefeat(card)) return 'onanydefeat';
  if (/(enemy[^.]*(cost|pay)|opponent must pay|pay \d more)[^.]*(additional|more|\+ ?1|de plus)|coûtent[^.]*de plus/i.test(d) && firesCostPenalty(card)) return 'costpenalty';
  if (/doesn'?t lose[^.]*power token|ne perd[^.]*jeton/i.test(d) && firesTokenPersist(card)) return 'tokenpersist';
  if (/lost this mission[^.]*(move|déplac)|perdu cette mission[^.]*déplac/i.test(d) && firesScoringMove(card)) return 'scoringmove';
  if (/can'?t be (hidden|defeated)|cannot be (defeated|hidden)|ne peut[^.]*(caché|vaincu)/i.test(d) && firesImmunity(card)) return 'immunity';
  if (/enemy[^.]*cannot move (from|out of) this mission|ennemis?[^.]*ne peuvent[^.]*quitter/i.test(d) && firesMoveBlock(card)) return 'moveblock';
  if (/opponent cannot play characters while hidden|cannot reveal|ne peut[^.]*révéler/i.test(d) && firesRevealBlock(card)) return 'revealblock';
  if (/friendly[^.]*cannot be hidden|alliés?[^.]*ne peuvent[^.]*caché/i.test(d) && firesHideAllyBlock(card)) return 'hideallyblock';
  if (/if this character is affected by an enemy effect|si ce personnage est affecté/i.test(d) && firesOnAffected(card)) return 'onaffected';
  return null;
}

export function phase810Scenario(cardId: string, kind: Phase810Kind): SimScenario {
  const card = getCharacterById(cardId)!;
  switch (kind) {
    case 'score': return scoreScenario(card);
    case 'aura': return auraScenario(card);
    case 'endround': return endRoundScenario(card);
    case 'chakra': return chakraScenario(card);
    case 'onenemy': return onEnemyPlayedScenario(card);
    case 'protect': return protectScenario(card);
    case 'upgradeover': return upgradeOverScenario(card);
    case 'costmod': return costModScenario(card);
    case 'hiddencost': return hiddenCostScenario(card);
    case 'winrestrict': return winRestrictionScenario(card);
    case 'sacrifice': return sacrificeScenario(card);
    case 'onmove': return onMoveScenario(card);
    case 'selfcost': return selfCostScenario(card);
    case 'onanydefeat': return onAnyDefeatScenario(card);
    case 'costpenalty': return costPenaltyScenario(card);
    case 'tokenpersist': return tokenPersistScenario(card);
    case 'scoringmove': return scoringMoveScenario(card);
    case 'immunity': return immunityScenario(card);
    case 'moveblock': return moveBlockScenario(card);
    case 'revealblock': return revealBlockScenario(card);
    case 'hideallyblock': return hideAllyBlockScenario(card);
    case 'onaffected': return onAffectedScenario(card);
  }
}
