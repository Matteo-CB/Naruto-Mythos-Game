import type { GameState, CharacterCard, CharacterInPlay, GameAction, PlayerID } from '@/lib/engine/types';
import { getCharacterById, getCardsByName } from '@/lib/data/cardIndex';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { runScenario } from '@/lib/cards/sim/runScenario';
import type { SimScenario } from '@/lib/cards/sim/scenarios';

const DECK_IDS = ['KS-021-C', 'KS-011-C', 'KS-007-C', 'KS-052-C', 'KS-094-C'];
function deck(): CharacterCard[] { return DECK_IDS.map((id) => getCharacterById(id)!).filter(Boolean); }

const nameOf = (id: string) => (getCharacterById(id)?.name_fr ?? '').toUpperCase();

export function hasUpgradeEffect(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.type === 'UPGRADE');
}
export function upgradeEffectIndex(card: CharacterCard): number {
  return (card.effects ?? []).findIndex((e) => e.type === 'UPGRADE');
}

export function cheaperSameNameBase(card: CharacterCard): CharacterCard | null {
  const same = getCardsByName(card.name_fr)
    .filter((c) => c.card_type === 'character' && c.id !== card.id && (c.chakra ?? 0) < (card.chakra ?? 0))
    .sort((a, b) => (b.chakra ?? 0) - (a.chakra ?? 0));
  return (same[0] as CharacterCard) ?? null;
}

function upgradedEnemyStack(baseId: string, topId: string, iid: string, missionIndex: number): CharacterInPlay {
  const base = getCharacterById(baseId)!;
  const top = getCharacterById(topId)!;
  return {
    instanceId: iid, card: top, stack: [base, top],
    isHidden: false, wasRevealedAtLeastOnce: true, powerTokens: 0,
    controlledBy: 'player2', originalOwner: 'player2', missionIndex,
  };
}

const ALLY_POOL: Array<{ id: string; iid: string; hidden?: boolean; tokens?: number }> = [
  { id: 'KS-011-C', iid: 'up-sakura' },
  { id: 'KS-057-C', iid: 'up-jirobo' },
  { id: 'KS-009-C', iid: 'up-leaf' },
  { id: 'KS-003-C', iid: 'up-tsunade' },
  { id: 'KS-096-C', iid: 'up-hiddenally', hidden: true },
  { id: 'KS-025-C', iid: 'up-kiba' },
  { id: 'KS-027-C', iid: 'up-akamaru' },
  { id: 'KS-040-C', iid: 'up-tenten' },
  { id: 'KS-091-UC', iid: 'up-itachi' },
];
const ENEMY_POOL: Array<{ id: string; iid: string; hidden?: boolean; tokens?: number }> = [
  { id: 'KS-017-C', iid: 'up-e-pw1' },
  { id: 'KS-005-C', iid: 'up-e-weak', tokens: 1 },
  { id: 'KS-086-C', iid: 'up-e-strong', tokens: 2 },
  { id: 'KS-052-C', iid: 'up-e-hidden', hidden: true },
  { id: 'KS-094-C', iid: 'up-e-summon' },
  { id: 'KS-006-UC', iid: 'up-e-instant' },
  { id: 'KS-035-UC', iid: 'up-e-pw4' },
  { id: 'KS-059-C', iid: 'up-e-soundfour' },
];

function baseChar(card: CharacterCard): CharacterInPlay {
  const real = cheaperSameNameBase(card);
  if (real) return simChar(real.id, { owner: 'player1', instanceId: 'up-base' });
  const clone = { ...card, chakra: 0 } as CharacterCard;
  return {
    instanceId: 'up-base', card: clone, stack: [clone],
    isHidden: false, wasRevealedAtLeastOnce: true, powerTokens: 0,
    controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0,
  };
}

function upgradeBoard(card: CharacterCard): GameState {
  const base = baseChar(card);
  const demoName = (card.name_fr ?? '').toUpperCase();
  const skip = new Set<string>([demoName, nameOf(base.card.id)]);

  const p1: CharacterInPlay[] = [base];
  for (const a of ALLY_POOL) {
    if (skip.has(nameOf(a.id))) continue;
    p1.push(simChar(a.id, { owner: 'player1', instanceId: a.iid, hidden: a.hidden, powerTokens: a.tokens }));
    skip.add(nameOf(a.id));
  }

  const usedE = new Set<string>();
  const p2: CharacterInPlay[] = [];
  for (const e of ENEMY_POOL) {
    if (usedE.has(nameOf(e.id))) continue;
    p2.push(simChar(e.id, { owner: 'player2', instanceId: e.iid, hidden: e.hidden, powerTokens: e.tokens }));
    usedE.add(nameOf(e.id));
  }
  p2.push(upgradedEnemyStack('KS-010-C', 'KS-108-R', 'up-e-upgraded', 0));

  const handExtra = ['KS-094-C', 'KS-021-C', 'KS-069-UC'].filter((id) => !skip.has(nameOf(id)));
  const st = buildSimState({ hand1: [card.id, ...handExtra], p1, p2, missions: 2, chakra1: 24, edgeHolder: 'player1' });

  st.activeMissions[1].player1Characters = [simChar('KS-007-C', { owner: 'player1', instanceId: 'up-far-ally', missionIndex: 1 })];
  if (!skip.has(nameOf('KS-061-C'))) {
    st.activeMissions[1].player1Characters.push(simChar('KS-061-C', { owner: 'player1', instanceId: 'up-far-sf', missionIndex: 1 }));
  }
  st.activeMissions[1].player2Characters = [
    simChar('KS-009-C', { owner: 'player2', instanceId: 'up-far-e1', missionIndex: 1 }),
  ];

  st.player1.deck = deck();
  st.player2.deck = deck();
  st.player2.hand = ['KS-021-C', 'KS-011-C'].map((id) => getCharacterById(id)!);
  st.player1.discardPile = ['KS-001-C', 'KS-052-C'].map((id) => getCharacterById(id)!);
  return st;
}

const UPGRADE_ACTION: GameAction = { type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'up-base' };

function upgradeBoardReveal(card: CharacterCard): GameState {
  const st = upgradeBoard(card);
  const idx = st.player1.hand.findIndex((c) => c.id === card.id);
  if (idx >= 0) st.player1.hand.splice(idx, 1);
  st.activeMissions[0].player1Characters.push(simChar(card.id, { owner: 'player1', instanceId: 'up-demo-hidden', hidden: true }));
  return st;
}
const REVEAL_UPGRADE_ACTION: GameAction = { type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: 'up-demo-hidden', upgradeTargetInstanceId: 'up-base' };

function hasAmbush(card: CharacterCard): boolean {
  return (card.effects ?? []).some((e) => e.type === 'AMBUSH');
}

function upgradeBoardSingleEnemy(card: CharacterCard): GameState {
  const st = upgradeBoard(card);
  st.activeMissions[0].player2Characters = st.activeMissions[0].player2Characters
    .filter((c) => c.instanceId === 'up-e-weak' || c.isHidden);
  return st;
}

interface UpgradePlay { build: () => GameState; action: GameAction }
function upgradePlays(card: CharacterCard): UpgradePlay[] {
  const plays: UpgradePlay[] = [{ build: () => upgradeBoard(card), action: UPGRADE_ACTION }];
  if (hasAmbush(card)) plays.push({ build: () => upgradeBoardReveal(card), action: REVEAL_UPGRADE_ACTION });
  plays.push({ build: () => upgradeBoardSingleEnemy(card), action: UPGRADE_ACTION });
  return plays;
}

export function upgradeScenario(card: CharacterCard): SimScenario {
  for (const p of upgradePlays(card)) {
    if (firesUpgradePlay(card, p)) return { build: p.build, play: { player: 'player1' as PlayerID, action: p.action } };
  }
  return { build: () => upgradeBoard(card), play: { player: 'player1' as PlayerID, action: UPGRADE_ACTION } };
}

const ANNOUNCE = new Set(['EFFECT_NO_TARGET', 'EFFECT_CONTINUOUS', 'EFFECT_SCORE_ANNOUNCE']);
const BOARD_IDS = new Set([
  'up-base', 'up-sakura', 'up-jirobo', 'up-leaf', 'up-tsunade', 'up-hiddenally', 'up-kiba', 'up-tenten',
  'up-e-pw1', 'up-e-weak', 'up-e-strong', 'up-e-hidden', 'up-e-summon', 'up-e-instant', 'up-e-pw4', 'up-e-soundfour', 'up-e-upgraded', 'up-akamaru', 'up-itachi',
  'up-far-ally', 'up-far-sf', 'up-far-e1',
]);

function snap(s: GameState): Map<string, string> {
  const m = new Map<string, string>();
  for (const mi of s.activeMissions) for (const c of [...mi.player1Characters, ...mi.player2Characters]) {
    m.set(c.instanceId, `${c.missionIndex}:${c.isHidden}:${c.powerTokens}:${c.card.id}`);
  }
  return m;
}

function firesUpgradePlay(card: CharacterCard, play: UpgradePlay): boolean {
  let states: GameState[];
  try {
    states = runScenario({ build: play.build, play: { player: 'player1' as PlayerID, action: play.action } });
  } catch { return false; }
  if (states.length < 2) return false;
  const first = states[0];
  const last = states[states.length - 1];
  if (last.pendingActions.length > 0) return false;

  const playedAsUpgrade = last.log.some((l) => { const a = l.action ?? ''; return a === 'UPGRADE_CHARACTER' || a === 'REVEAL_UPGRADE'; });
  if (!playedAsUpgrade) return false;

  const newLogs = last.log.slice(first.log.length);
  if (newLogs.some((l) => { const a = l.action ?? ''; return a.startsWith('EFFECT') && !ANNOUNCE.has(a); })) return true;

  const A = snap(first), B = snap(last);
  for (const id of BOARD_IDS) {
    if (id === 'up-base') continue;
    if (A.has(id) && (!B.has(id) || A.get(id) !== B.get(id))) return true;
  }
  let extra = 0;
  for (const mi of last.activeMissions) for (const c of mi.player1Characters) {
    if (BOARD_IDS.has(c.instanceId) || c.instanceId === 'up-base') continue;
    if (c.card.id === card.id) continue;
    extra++;
  }
  if (extra > 0) return true;

  return last.player1.deck.length !== first.player1.deck.length ||
    last.player2.deck.length !== first.player2.deck.length ||
    last.player2.chakra !== first.player2.chakra ||
    last.player1.missionPoints !== first.player1.missionPoints ||
    last.player2.hand.length !== first.player2.hand.length ||
    last.player1.discardPile.length !== first.player1.discardPile.length;
}

export function firesUpgrade(card: CharacterCard): boolean {
  return upgradePlays(card).some((p) => firesUpgradePlay(card, p));
}
