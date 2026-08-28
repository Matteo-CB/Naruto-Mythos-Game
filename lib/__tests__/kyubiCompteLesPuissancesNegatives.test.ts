import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { GameEngine } from '@/lib/engine/GameEngine';
import { getEffectivePower } from '@/lib/effects/powerUtils';
import { getCardById } from '@/lib/data/cardIndex';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { GameState } from '@/lib/engine/types';

beforeAll(() => {
  initializeRegistry();
});

const KYUBI = 'KS-134-S';
const KYUBI_MOINS_CHER = 'SS-006-UC';
const SASUKE_QUI_FAIBLIT = 'KS-013-C';
const ENNEMI_COSTAUD = 'KS-132-S';
const ALLIES = [
  'KS-001-C', 'KS-006-UC', 'KS-007-C', 'KS-009-C',
  'KS-011-C', 'KS-016-UC', 'KS-017-C',
];

function plateau(): GameState {
  const s = buildSimState({
    p1: [
      simChar(KYUBI_MOINS_CHER, { owner: 'player1', instanceId: 'kyubi' }),
      simChar(SASUKE_QUI_FAIBLIT, { owner: 'player1', instanceId: 'sasuke' }),
      ...ALLIES.map((id, i) => simChar(id, { owner: 'player1', instanceId: `allie${i}` })),
    ],
    p2: [simChar(ENNEMI_COSTAUD, { owner: 'player2', instanceId: 'costaud' })],
    missions: 1,
    chakra1: 40,
    chakra2: 40,
    edgeHolder: 'player1',
  });
  s.player1.hand = [getCardById(KYUBI) as never];
  return s;
}

function jouerLeKyubiEnAmelioration(depart: GameState): GameState {
  return GameEngine.applyAction(depart, 'player1', {
    type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0,
  } as never);
}

function repondre(depart: GameState, cible: string): GameState {
  const q = depart.pendingActions[0];
  return GameEngine.applyAction(depart, q.player, {
    type: 'SELECT_TARGET', pendingActionId: q.id, selectedTargets: [cible],
  } as never);
}

function questionEnCours(s: GameState) {
  return s.pendingActions[0];
}

function budgetRestant(s: GameState): number | null {
  const suite = s.pendingEffects.find((e) => e.targetSelectionType === 'KYUBI134_CHOOSE_HIDE_TARGETS');
  if (!suite) return null;
  return (JSON.parse(suite.effectDescription) as { remainingPower: number }).remainingPower;
}

function ouvrirLeChoix(): GameState {
  let s = jouerLeKyubiEnAmelioration(plateau());
  while (questionEnCours(s)?.descriptionKey !== 'game.effect.desc.kyubi134ChooseHide') {
    const q = questionEnCours(s);
    expect(q, 'le Kyubi doit finir par proposer ses cibles').toBeDefined();
    s = repondre(s, q.options[0]);
  }
  return s;
}

describe('le KYUBI 134 compte les puissances negatives dans son total', () => {
  it('met bien un personnage a puissance negative sur le plateau', () => {
    const s = plateau();
    const sasuke = s.activeMissions[0].player1Characters.find((c) => c.instanceId === 'sasuke')!;
    expect(getEffectivePower(s, sasuke, 'player1'), 'quatre de base, un de moins par autre allie').toBe(-4);
  });

  it('propose bien le personnage a puissance negative', () => {
    const s = ouvrirLeChoix();
    expect(questionEnCours(s).options).toContain('sasuke');
  });

  it('cacher un moins quatre laisse dix, pas six', () => {
    const s = repondre(ouvrirLeChoix(), 'sasuke');
    expect(budgetRestant(s)).toBe(10);
  });

  it('ouvre alors des cibles que six ne permettait pas', () => {
    const avant = ouvrirLeChoix();
    const optionsAvant = new Set(questionEnCours(avant).options);
    const apres = repondre(avant, 'sasuke');
    const nouvelles = questionEnCours(apres).options.filter((o) => !optionsAvant.has(o));
    expect(nouvelles.length, 'un allie trop puissant pour six devient atteignable').toBeGreaterThan(0);
  });

  it('n ecrase plus aucune puissance a zero dans l instantane du Kyubi', () => {
    const source = readFileSync('lib/effects/EffectEngine.ts', 'utf8');
    expect(source).not.toContain('Math.max(0, getEffectivePower');
  });
});
