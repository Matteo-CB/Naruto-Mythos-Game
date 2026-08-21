import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById, getCharacterById } from '@/lib/data/cardIndex';
import type { GameState } from '@/lib/engine/types';

const TAYUYA_125 = 'KS-125-R';
const TAYUYA_064 = 'KS-064-C';
const TAYUYA_065 = 'KS-065-UC';
const KABUTO_052 = 'KS-052-C';
const KABUTO_054 = 'KS-054-UC';

beforeAll(() => { initializeRegistry(); });

interface Resultat {
  fin: GameState;
  vus: string[];
}

function derouler(depart: GameState, prefere: (options: string[], type: string) => string): Resultat {
  const vus: string[] = [];
  let courant = depart;
  let garde = 0;
  while (courant.pendingActions.length > 0 && garde < 20) {
    const q = courant.pendingActions[0];
    const eff = courant.pendingEffects.find((e) => e.id === q.sourceEffectId);
    const type = eff?.targetSelectionType ?? '?';
    vus.push(type);
    courant = GameEngine.applyAction(courant, q.player, {
      type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [prefere(q.options, type)],
    } as never);
    garde += 1;
  }
  return { fin: courant, vus };
}

function jetons(s: GameState, id: string): number {
  for (const m of s.activeMissions) {
    for (const c of [...m.player1Characters, ...m.player2Characters]) {
      if (c.instanceId === id) return c.powerTokens;
    }
  }
  return -1;
}

function pile(s: GameState, id: string): string[] {
  for (const m of s.activeMissions) {
    for (const c of [...m.player1Characters, ...m.player2Characters]) {
      if (c.instanceId === id) return (c.stack ?? []).map((x) => String(x.id));
    }
  }
  return [];
}

function kabuto(depuisLeePlateau: boolean): Resultat {
  const p1 = [
    simChar(TAYUYA_064, { owner: 'player1', instanceId: 'tayuya' }),
    simChar(KABUTO_052, { owner: 'player1', instanceId: 'kabuto' }),
  ];
  if (depuisLeePlateau) p1.push(simChar(KABUTO_054, { owner: 'player1', instanceId: 'cache', hidden: true }));

  const s = buildSimState({ p1, p2: [], missions: 1, chakra1: 30, edgeHolder: 'player1' });
  s.phase = 'action';
  s.activePlayer = 'player1';
  s.player1.hand = [getCardById(TAYUYA_125) as never];
  if (!depuisLeePlateau) s.player1.hand.push(getCardById(KABUTO_054) as never);
  s.player1.deck = [getCharacterById(KABUTO_052)!, getCharacterById(TAYUYA_064)!];

  const depart = GameEngine.applyAction(s, 'player1', {
    type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'tayuya',
  } as never);

  return derouler(depart, (options, type) => {
    if (type === 'TAYUYA125_CHOOSE_SOUND') {
      const veut = depuisLeePlateau ? 'HIDDEN_' : 'HAND_';
      return options.find((o) => o.startsWith(veut)) ?? options[0];
    }
    if (type === 'EFFECT_PLAY_UPGRADE_OR_FRESH' || type === 'REVEAL_HIDDEN_UPGRADE_OR_FRESH') {
      return options.find((o) => o !== 'FRESH') ?? options[0];
    }
    return options[0];
  });
}

describe('un personnage revele par un effet garde son effet d amelioration', () => {
  it('temoin: joue depuis la main en amelioration, son effet s applique', () => {
    const { fin, vus } = kabuto(false);
    expect(vus).toContain('KABUTO054_CONFIRM_UPGRADE');
    expect(pile(fin, 'kabuto'), 'la carte est bien empilee').toEqual([KABUTO_052, KABUTO_054]);
    expect(jetons(fin, 'kabuto'), 'POWERUP 1 applique').toBe(1);
  });

  it('revele depuis le plateau en amelioration, son effet s applique aussi', () => {
    const { fin, vus } = kabuto(true);
    expect(vus, 'l effet d amelioration de la carte revelee doit etre propose').toContain('KABUTO054_CONFIRM_UPGRADE');
    expect(pile(fin, 'kabuto'), 'la revelation fusionne bien en amelioration').toEqual([KABUTO_052, KABUTO_054]);
    expect(jetons(fin, 'kabuto'), 'POWERUP 1 applique comme depuis la main').toBe(1);
  });

  it('les deux chemins donnent le meme resultat', () => {
    expect(jetons(kabuto(true).fin, 'kabuto')).toBe(jetons(kabuto(false).fin, 'kabuto'));
  });
});

describe('une revelation par effet declenche aussi l embuscade', () => {
  it('AMBUSH et UPGRADE se declenchent quand la revelation fusionne', () => {
    const s = buildSimState({
      p1: [simChar(TAYUYA_064, { owner: 'player1', instanceId: 'tayuya' })],
      p2: [], missions: 2, chakra1: 30, edgeHolder: 'player1',
    });
    s.phase = 'action';
    s.activePlayer = 'player1';
    s.activeMissions[1].player1Characters = [
      simChar(TAYUYA_064, { owner: 'player1', instanceId: 'tayuya1' }),
      simChar(TAYUYA_065, { owner: 'player1', instanceId: 'cache65', hidden: true, missionIndex: 1 }),
    ];
    s.player1.hand = [getCardById(TAYUYA_125) as never];
    s.player1.deck = [getCharacterById(TAYUYA_064)!, getCharacterById(KABUTO_052)!, getCharacterById(TAYUYA_065)!];

    const depart = GameEngine.applyAction(s, 'player1', {
      type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: 'tayuya',
    } as never);

    const { fin, vus } = derouler(depart, (options, type) => {
      if (type === 'TAYUYA125_CHOOSE_SOUND') return options.find((o) => o.startsWith('HIDDEN_')) ?? options[0];
      if (type === 'REVEAL_HIDDEN_UPGRADE_OR_FRESH') return options.find((o) => o !== 'FRESH') ?? options[0];
      return options[0];
    });

    expect(pile(fin, 'tayuya1'), 'la carte revelee est empilee en amelioration').toEqual([TAYUYA_064, TAYUYA_065]);
    expect(vus, 'l embuscade de la carte revelee est proposee').toContain('TAYUYA065_CONFIRM_AMBUSH');
    expect(vus, 'son effet d amelioration aussi').toContain('TAYUYA065_CONFIRM_UPGRADE');
  });
});

describe('les chemins de revelation par effet passent par les resolveurs de revelation', () => {
  const SOURCE = readFileSync(join(__dirname, '..', 'effects', 'EffectEngine.ts'), 'utf8');

  function bloc(ancre: string, longueur: number): string {
    const at = SOURCE.indexOf(ancre);
    expect(at, `ancre introuvable: ${ancre}`).toBeGreaterThan(-1);
    return SOURCE.slice(at, at + longueur);
  }

  it('une revelation qui fusionne resout aussi l amelioration', () => {
    const corps = bloc('static revealHiddenWithReduction', 9000);
    expect(corps, 'la fusion doit resoudre MAIN, AMBUSH et UPGRADE').toContain('resolveRevealUpgradeEffects');
  });

  it('le choix amelioration ou pose fraiche ne retombe pas sur les effets de pose', () => {
    const corps = bloc("case 'REVEAL_HIDDEN_UPGRADE_OR_FRESH'", 6600);
    expect(corps, 'une revelation n est pas une pose: elle declenche l embuscade').not.toContain('resolvePlayEffects');
    expect(corps).toContain('resolveRevealEffects');
    expect(corps).toContain('resolveRevealUpgradeEffects');
  });

  it('le prix d une revelation par effet passe par le cout reel', () => {
    const corps = bloc("case 'REVEAL_HIDDEN_UPGRADE_OR_FRESH'", 6600);
    expect(corps, 'jamais le cout imprime: les reductions doivent compter').toContain('calculateEffectiveCost');
  });
});
