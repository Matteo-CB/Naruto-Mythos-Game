import type { GameState, CharacterInPlay, CharacterCard, GameAction, PlayerID } from '@/lib/engine/types';
import { calculateCharacterPower } from '@/lib/engine/phases/PowerCalculation';
import { getCharacterById, getCardsByName } from '@/lib/data/cardIndex';
import { getAllCards } from '@/lib/data/cardLoader';
import { parseDuelCharacterName } from '@/lib/effects/duelUtils';
import { checkFlexibleUpgrade } from '@/lib/engine/rules/PlayValidation';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { runScenario } from '@/lib/cards/sim/runScenario';
import type { SimScenario } from '@/lib/cards/sim/scenarios';

const DECK_FILLER = ['KS-021-C', 'KS-011-C', 'KS-007-C', 'KS-086-C', 'KS-052-C'];
const HAND_EXTRA = ['KS-094-C', 'KS-052-C'];

const PLACED_IDS = [
  'sim-duel', 'sim-ally1', 'sim-fh', 'sim-ally2',
  'sim-enemy-weak', 'sim-enemy-strong', 'sim-enemy-hidden', 'sim-enemy-far', 'sim-enemy-far2',
  'sim-demo-hidden', 'sim-upg-base', 'sim-attach-host', 'sim-enemy-req', 'sim-ally-req',
];
const SOURCE_IDS = new Set(['sim-demo-hidden', 'sim-upg-base']);

type PlayMode = 'fresh' | 'fresh1' | 'reveal' | 'upgrade' | 'firstStrike';

function nameOf(cardId: string): string {
  return (getCharacterById(cardId)?.name_fr ?? '').toUpperCase();
}

const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');
function normName(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(DIACRITICS, '').trim();
}

function findCardByAnyName(name: string): CharacterCard | null {
  const target = normName(name);
  for (const c of getAllCards()) {
    if (c.card_type !== 'character') continue;
    if (normName(c.name_fr ?? '') === target || normName((c as { name_en?: string }).name_en ?? '') === target) {
      return c as CharacterCard;
    }
  }
  return null;
}

function duelPartnerId(card: CharacterCard): string | null {
  for (const e of card.effects ?? []) {
    if (!/DUEL/i.test(e.description)) continue;
    const name = parseDuelCharacterName(e.description);
    if (name && name.toLowerCase() !== 'effect') {
      const match = findCardByAnyName(name);
      if (match) return match.id;
    }
  }
  return null;
}

function cheaperSameName(card: CharacterCard): CharacterCard | null {
  const same = getCardsByName(card.name_fr).filter(
    (c) => c.card_type === 'character' && (c.chakra ?? 0) < (card.chakra ?? 0),
  );
  return (same[0] as CharacterCard) ?? null;
}

function flexibleUpgradeBase(card: CharacterCard): CharacterCard | null {
  let best: CharacterCard | null = null;
  for (const candidate of getAllCards()) {
    if (candidate.card_type !== 'character') continue;
    if ((candidate.chakra ?? 99) >= (card.chakra ?? 0)) continue;
    if ((candidate.name_fr ?? '').toUpperCase() === (card.name_fr ?? '').toUpperCase()) continue;
    if ((candidate.keywords ?? []).includes('Summon')) continue;
    if ((candidate.name_fr ?? '').toUpperCase().includes('OROCHIMARU')) continue;
    if (!checkFlexibleUpgrade(card, candidate as CharacterCard)) continue;
    if (!best || (candidate.power ?? 0) > (best.power ?? 0)) best = candidate as CharacterCard;
  }
  return best;
}

function chars(ids: string[]): CharacterCard[] {
  return ids.map((id) => getCharacterById(id)).filter((c): c is CharacterCard => !!c);
}

function attachHostFor(card: CharacterCard): string | null {
  if ((card as { card_type?: string }).card_type !== 'attachment') return null;
  if ((card as { attach_to?: string }).attach_to === 'mission') return null;

  let needGroup: string | null = null;
  for (const effect of card.effects ?? []) {
    if (effect.type !== 'ATTACH') continue;
    const match = /Attach to a friendly\s+(.+?)\s+character/i.exec(effect.description ?? '');
    if (match && match[1].toLowerCase() !== 'non-hidden') needGroup = match[1].trim();
  }

  for (const candidate of getAllCards()) {
    if (candidate.card_type !== 'character') continue;
    if ((candidate.chakra ?? 99) > 3) continue;
    if (needGroup && candidate.group !== needGroup) continue;
    if ((candidate.name_fr ?? '').toUpperCase() === (card.name_fr ?? '').toUpperCase()) continue;
    return candidate.id;
  }
  return null;
}

function requirementAllyFor(card: CharacterCard): string | null {
  for (const effect of card.effects ?? []) {
    const match = /friendly\s+([A-Za-z][A-Za-z ]{1,18}?)\s+character/i.exec(effect.description ?? '');
    if (!match) continue;
    const wanted = match[1].trim().toLowerCase();
    if (wanted === 'non-hidden' || wanted === 'hidden') continue;
    for (const candidate of getAllCards()) {
      if (candidate.card_type !== 'character') continue;
      if ((candidate.chakra ?? 99) > 4) continue;
      if ((candidate.name_fr ?? '').toUpperCase() === (card.name_fr ?? '').toUpperCase()) continue;
      const keywords = (candidate.keywords ?? []).map((k) => k.toLowerCase());
      const group = (candidate.group ?? '').toLowerCase();
      if (keywords.includes(wanted) || group === wanted) return candidate.id;
    }
  }
  return null;
}

function requirementEnemyFor(card: CharacterCard): string | null {
  for (const effect of card.effects ?? []) {
    const match = /enemy\s+([A-Za-z][A-Za-z ]{1,18}?)\s+character/i.exec(effect.description ?? '');
    if (!match) continue;
    const wanted = match[1].trim().toLowerCase();
    if (wanted === 'non-hidden' || wanted === 'hidden') continue;
    for (const candidate of getAllCards()) {
      if (candidate.card_type !== 'character') continue;
      if ((candidate.chakra ?? 99) > 4) continue;
      const keywords = (candidate.keywords ?? []).map((k) => k.toLowerCase());
      const group = (candidate.group ?? '').toLowerCase();
      if (keywords.includes(wanted) || group === wanted) return candidate.id;
    }
  }
  return null;
}

function buildBoard(card: CharacterCard, mode: PlayMode, edge: PlayerID): GameState {
  const cardId = card.id;
  const demoName = (card.name_fr ?? '').toUpperCase();

  const usedF = new Set<string>([demoName]);
  const friendly: CharacterInPlay[] = [];
  const addF = (id: string, instanceId: string, opts: { hidden?: boolean; tokens?: number } = {}) => {
    if (usedF.has(nameOf(id))) return;
    friendly.push(simChar(id, { owner: 'player1', instanceId, hidden: opts.hidden, powerTokens: opts.tokens }));
    usedF.add(nameOf(id));
  };

  const partner = duelPartnerId(card);
  if (partner) addF(partner, 'sim-duel');

  const host = attachHostFor(card);
  if (host) addF(host, 'sim-attach-host');

  const reqAlly = requirementAllyFor(card);
  if (reqAlly) addF(reqAlly, 'sim-ally-req');
  addF('KS-011-C', 'sim-ally1');
  addF('KS-096-C', 'sim-fh', { hidden: true });

  const usedE = new Set<string>();
  const enemies: CharacterInPlay[] = [];
  const addE = (id: string, instanceId: string, opts: { hidden?: boolean; tokens?: number } = {}) => {
    if (usedE.has(nameOf(id))) return;
    enemies.push(simChar(id, { owner: 'player2', instanceId, hidden: opts.hidden, powerTokens: opts.tokens }));
    usedE.add(nameOf(id));
  };
  const reqEnemy = requirementEnemyFor(card);
  if (reqEnemy) addE(reqEnemy, 'sim-enemy-req');
  addE('KS-005-C', 'sim-enemy-weak');
  addE('KS-086-C', 'sim-enemy-strong', { tokens: 1 });
  addE('KS-052-C', 'sim-enemy-hidden', { hidden: true });

  const handExtra = HAND_EXTRA.filter((id) => nameOf(id) !== demoName);
  const alreadyInPlay = mode === 'reveal' || mode === 'firstStrike';
  const hand1 = alreadyInPlay ? [...handExtra] : [cardId, ...handExtra];

  if (mode === 'reveal') friendly.push(simChar(cardId, { owner: 'player1', instanceId: 'sim-demo-hidden', hidden: true }));
  if (mode === 'firstStrike') friendly.push(simChar(cardId, { owner: 'player1', instanceId: 'sim-demo-striker' }));
  if (mode === 'upgrade') {
    const base = cheaperSameName(card) ?? flexibleUpgradeBase(card);
    if (base) friendly.push(simChar(base.id, { owner: 'player1', instanceId: 'sim-upg-base' }));
  }

  const state = buildSimState({ hand1, p1: friendly, p2: enemies, missions: 2, chakra1: 18, edgeHolder: edge });
  state.activeMissions[1].player1Characters = [simChar('KS-007-C', { owner: 'player1', instanceId: 'sim-ally2', missionIndex: 1 })];
  state.activeMissions[1].player2Characters = [
    simChar('KS-005-C', { owner: 'player2', instanceId: 'sim-enemy-far', missionIndex: 1 }),
    simChar('KS-017-C', { owner: 'player2', instanceId: 'sim-enemy-far2', missionIndex: 1 }),
  ];

  state.player1.deck = chars(DECK_FILLER);
  state.player2.deck = chars(DECK_FILLER);
  state.player2.hand = chars(['KS-021-C', 'KS-011-C']);
  state.player1.discardPile = chars(['KS-001-C', 'KS-052-C']);
  return state;
}

function playActionFor(card: CharacterCard, mode: PlayMode): { player: PlayerID; action: GameAction } | null {
  if (mode === 'fresh') return { player: 'player1', action: { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false } };
  if (mode === 'fresh1') return { player: 'player1', action: { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 1, hidden: false } };
  if (mode === 'reveal') return { player: 'player1', action: { type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'sim-demo-hidden' } };
  if (mode === 'firstStrike') return { player: 'player1', action: { type: 'USE_FIRST_STRIKE', characterInstanceId: 'sim-demo-striker' } };
  if (mode === 'upgrade') {
    if (!cheaperSameName(card) && !flexibleUpgradeBase(card)) return null;
    return { player: 'player1', action: { type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'sim-upg-base' } };
  }
  return null;
}

function scenarioForMode(card: CharacterCard, mode: PlayMode, edge: PlayerID): SimScenario | null {
  const play = playActionFor(card, mode);
  if (!play) return null;
  return { build: () => buildBoard(card, mode, edge), play };
}

function scenarioUntilScoring(card: CharacterCard, mode: PlayMode, edge: PlayerID): SimScenario | null {
  const base = scenarioForMode(card, mode, edge);
  if (!base) return null;
  return {
    ...base,
    followups: [
      { player: 'player2', action: { type: 'PASS' } as GameAction },
      { player: 'player1', action: { type: 'PASS' } as GameAction },
    ],
  };
}

function snapshot(state: GameState): Map<string, string> {
  const m = new Map<string, string>();
  for (const mi of state.activeMissions) {
    for (const c of mi.player1Characters) m.set(c.instanceId, `1:${c.missionIndex ?? '?'}:${c.isHidden ? 'h' : 'v'}:${c.powerTokens}`);
    for (const c of mi.player2Characters) m.set(c.instanceId, `2:${c.missionIndex ?? '?'}:${c.isHidden ? 'h' : 'v'}:${c.powerTokens}`);
  }
  return m;
}

function part(snap: string | undefined, i: number): string {
  return snap ? (snap.split(':')[i] ?? '') : '';
}

function powerBoard(state: GameState): Map<string, number> {
  const m = new Map<string, number>();
  for (const mi of state.activeMissions) {
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      const owner: PlayerID = side === 'player1Characters' ? 'player1' : 'player2';
      for (const c of mi[side]) {
        let p = 0;
        try { p = calculateCharacterPower(state, c, owner); } catch { p = 0; }
        m.set(c.instanceId, p);
      }
    }
  }
  return m;
}

function auraChangesAPower(first: GameState, last: GameState): boolean {
  const before = powerBoard(first);
  const after = powerBoard(last);
  for (const [id, value] of after) {
    if (!before.has(id)) continue;
    if (before.get(id) !== value) return true;
  }
  return false;
}

const ANNOUNCE_ACTIONS = new Set(['EFFECT_CONTINUOUS', 'EFFECT_SCORE_ANNOUNCE']);

interface FireDetail { real: boolean; loose: boolean; announce: boolean }

function firesDetail(scenario: SimScenario, mode: PlayMode, allowAuraDelta = false): FireDetail {
  let states: GameState[];
  try {
    states = runScenario(scenario);
  } catch {
    return { real: false, loose: false, announce: false };
  }
  if (states.length < 2) return { real: false, loose: false, announce: false };
  const first = states[0];
  const last = states[states.length - 1];
  if (last.pendingActions.length > 0) return { real: false, loose: false, announce: false };

  const realLogs = (s: GameState) => s.log.filter((l) => {
    const a = l.action ?? '';
    return a.startsWith('EFFECT') && a !== 'EFFECT_NO_TARGET' && !ANNOUNCE_ACTIONS.has(a);
  }).length;
  const announceLogs = (s: GameState) => s.log.filter((l) => ANNOUNCE_ACTIONS.has(l.action ?? '')).length;

  const announce = announceLogs(last) > announceLogs(first);

  // real = the effect concretely executed (a real EFFECT_ log, or an extra character was played)
  let real = realLogs(last) > realLogs(first);
  const expectedExtra = mode === 'fresh' || mode === 'fresh1' ? 1 : 0;
  let extra = 0;
  for (const mi of last.activeMissions) {
    for (const c of mi.player1Characters) {
      if (PLACED_IDS.includes(c.instanceId) || SOURCE_IDS.has(c.instanceId)) continue;
      extra++;
    }
  }
  if (extra > expectedExtra) real = true;
  if (!real && allowAuraDelta && auraChangesAPower(first, last)) real = true;

  // loose = some board/resource delta (may be the effect or incidental) — coverage fallback only
  let loose = real;
  if (!loose) {
    const A = snapshot(first);
    const B = snapshot(last);
    for (const id of PLACED_IDS) {
      if (SOURCE_IDS.has(id)) {
        if (parseInt(part(B.get(id), 3) || '0', 10) > parseInt(part(A.get(id), 3) || '0', 10)) { loose = true; break; }
        if (A.has(id) && B.has(id) && part(A.get(id), 1) !== part(B.get(id), 1)) { loose = true; break; }
        continue;
      }
      if (A.has(id) && (!B.has(id) || A.get(id) !== B.get(id))) { loose = true; break; }
    }
  }
  if (!loose) {
    loose = last.player1.discardPile.length !== first.player1.discardPile.length ||
      last.player2.discardPile.length !== first.player2.discardPile.length ||
      last.player2.hand.length !== first.player2.hand.length ||
      last.player1.deck.length !== first.player1.deck.length ||
      last.player2.deck.length !== first.player2.deck.length ||
      last.player2.chakra !== first.player2.chakra ||
      last.edgeHolder !== first.edgeHolder ||
      last.player1.missionPoints !== first.player1.missionPoints ||
      last.player2.missionPoints !== first.player2.missionPoints;
  }
  if (!loose) {
    for (const mi of last.activeMissions) {
      for (const c of mi.player1Characters) {
        if (PLACED_IDS.includes(c.instanceId) || SOURCE_IDS.has(c.instanceId)) continue;
        if ((c.missionIndex ?? 0) !== 0 || c.isHidden || c.powerTokens > 0) { loose = true; break; }
      }
      if (loose) break;
    }
  }

  return { real, loose, announce };
}

function fires(scenario: SimScenario, mode: PlayMode): boolean {
  const d = firesDetail(scenario, mode);
  return d.real || d.loose || d.announce;
}

const MODES: PlayMode[] = ['fresh', 'reveal', 'upgrade', 'fresh1'];
const EDGES: PlayerID[] = ['player1', 'player2'];

const DEFEAT_TOOL = 'KS-120-R';
const DEFEAT_VICTIM = 'KS-017-C';

function buildDefeatFriendlyBoard(card: CharacterCard, edge: PlayerID): GameState {
  const friendly = [simChar(DEFEAT_VICTIM, { owner: 'player1', instanceId: 'sim-victim' })];
  const enemies = [simChar('KS-005-C', { owner: 'player2', instanceId: 'sim-enemy-weak' })];
  const state = buildSimState({ hand1: [card.id], p1: friendly, p2: enemies, missions: 2, chakra1: 18, edgeHolder: edge });
  state.player2.hand = chars([DEFEAT_TOOL]);
  state.player2.chakra = 18;
  state.player1.deck = chars(DECK_FILLER);
  state.player2.deck = chars(DECK_FILLER);
  return state;
}

function defeatFriendlyScenario(card: CharacterCard, edge: PlayerID): SimScenario {
  return {
    build: () => buildDefeatFriendlyBoard(card, edge),
    play: { player: 'player1', action: { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false } },
    followups: [{ player: 'player2', action: { type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false } }],
  };
}

function firesDefeatFriendly(card: CharacterCard, edge: PlayerID): boolean {
  const demoName = (card.name_fr ?? '').toUpperCase();
  if (demoName === nameOf(DEFEAT_VICTIM) || demoName === nameOf(DEFEAT_TOOL)) return false;
  const sc = defeatFriendlyScenario(card, edge);
  try {
    const playOnly = runScenario({ build: sc.build, play: sc.play });
    const afterPlay = playOnly[playOnly.length - 1];
    if (afterPlay.pendingActions.length > 0) return false;
    const full = runScenario(sc);
    const last = full[full.length - 1];
    if (last.pendingActions.length > 0) return false;
    if (last.player1.chakra > afterPlay.player1.chakra) return true;
    if (last.player1.hand.length !== afterPlay.player1.hand.length) return true;
    if (last.player1.deck.length !== afterPlay.player1.deck.length) return true;
    if (last.player1.missionPoints !== afterPlay.player1.missionPoints) return true;
  } catch { return false; }
  return false;
}

function hasDefeatFriendlyTrigger(card: CharacterCard): boolean {
  return (card.effects ?? []).some(
    (e) => e.description.includes('[⧗]') && /friendly[^.]*defeat|defeat[^.]*friendly/i.test(e.description),
  );
}

const scenarioCache = new Map<string, SimScenario | null>();

export function buildGeneratedScenario(cardId: string): SimScenario | null {
  const cached = scenarioCache.get(cardId);
  if (cached !== undefined) return cached;
  const card = getCharacterById(cardId);
  if (!card) { scenarioCache.set(cardId, null); return null; }

  if (hasDefeatFriendlyTrigger(card)) {
    for (const edge of EDGES) {
      if (firesDefeatFriendly(card, edge)) {
        const sc = defeatFriendlyScenario(card, edge);
        scenarioCache.set(cardId, sc);
        return sc;
      }
    }
  }

  const hasAmbush = (card.effects ?? []).some((e) => e.type === 'AMBUSH');
  const modeOrder: PlayMode[] = hasAmbush
    ? ['reveal', 'fresh', 'upgrade', 'fresh1']
    : MODES;

  let looseFallback: SimScenario | null = null;
  let announceFallback: SimScenario | null = null;
  for (const edge of EDGES) {
    for (const mode of modeOrder) {
      const scenario = scenarioForMode(card, mode, edge);
      if (!scenario) continue;
      const d = firesDetail(scenario, mode);
      if (d.real) { scenarioCache.set(cardId, scenario); return scenario; }
      if (d.loose && !looseFallback) looseFallback = scenario;
      if (d.announce && !announceFallback) announceFallback = scenario;
    }
  }
  const chosen = looseFallback ?? announceFallback;
  scenarioCache.set(cardId, chosen);
  return chosen;
}

const MODES_FOR_EFFECT: Record<string, PlayMode[]> = {
  MAIN: ['fresh', 'fresh1', 'reveal', 'upgrade'],
  AMBUSH: ['reveal'],
  UPGRADE: ['upgrade'],
  FIRST_STRIKE: ['firstStrike'],
  DUEL: ['fresh', 'fresh1', 'upgrade', 'reveal'],
  SCORE: ['fresh', 'fresh1', 'upgrade', 'reveal'],
};

export function revealScenarioFor(cardId: string): SimScenario | null {
  const card = getCharacterById(cardId);
  if (!card) return null;
  for (const edge of EDGES) {
    const scenario = scenarioForMode(card, 'reveal', edge);
    if (scenario) return scenario;
  }
  return null;
}

export function buildScenarioForEffect(cardId: string, effectType: string): SimScenario | null {
  const card = getCharacterById(cardId);
  if (!card) return null;
  if (!(card.effects ?? []).some((e) => e.type === effectType)) return null;

  const modes = MODES_FOR_EFFECT[effectType] ?? MODES;
  let looseFallback: SimScenario | null = null;
  let announceFallback: SimScenario | null = null;

  const wantsScoring = effectType === 'SCORE';
  const isContinuous = (card.effects ?? []).some((e) => e.type === effectType && e.description.includes('[⧗]'));
  for (const edge of EDGES) {
    for (const mode of modes) {
      const scenario = wantsScoring
        ? scenarioUntilScoring(card, mode, edge)
        : scenarioForMode(card, mode, edge);
      if (!scenario) continue;
      const d = firesDetail(scenario, mode, isContinuous);
      if (d.real) return scenario;
      if (d.loose && !looseFallback) looseFallback = scenario;
      if (d.announce && !announceFallback) announceFallback = scenario;
    }
  }
  return looseFallback ?? announceFallback;
}

export function generatedScenarioFires(cardId: string): boolean {
  return buildGeneratedScenario(cardId) !== null;
}

export function generatedScenarioFiresReal(cardId: string): boolean {
  const card = getCharacterById(cardId);
  if (!card) return false;
  if (hasDefeatFriendlyTrigger(card)) {
    for (const edge of EDGES) if (firesDefeatFriendly(card, edge)) return true;
  }
  for (const edge of EDGES) {
    for (const mode of MODES) {
      const scenario = scenarioForMode(card, mode, edge);
      if (scenario && firesDetail(scenario, mode).real) return true;
    }
  }
  return false;
}

export function listGeneratableCardIds(): string[] {
  const covered: string[] = [];
  for (const card of getAllCards()) {
    if (card.card_type !== 'character') continue;
    if ((card.effects ?? []).length === 0) continue;
    if (generatedScenarioFires(card.id)) covered.push(card.id);
  }
  return covered;
}
