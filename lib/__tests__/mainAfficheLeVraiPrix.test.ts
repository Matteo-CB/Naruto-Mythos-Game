import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getCardById } from '@/lib/data/cardIndex';
import { coutMinimalPourPoser } from '@/lib/engine/rules/coutMinimal';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import type { CharacterCard, GameState } from '@/lib/engine/types';

const RACINE = process.cwd();
const RASA = 'SS-051-UC';

function plateau(chakra: number, avecRasa: number): GameState {
  const allies = [];
  for (let i = 0; i < avecRasa; i++) {
    allies.push(simChar(RASA, { owner: 'player1', instanceId: 'rasa' + i }));
  }
  return buildSimState({ p1: allies as never, p2: [], missions: 3, chakra1: chakra });
}

describe('la main annonce le prix reellement paye, remises comprises', () => {
  beforeAll(() => { initializeRegistry(); });

  it('sans remise, le prix minimal est le prix imprime', () => {
    const carte = getCardById('SS-047-UC') as CharacterCard;
    const state = plateau(30, 0);
    expect(coutMinimalPourPoser(state, 'player1', carte)).toBe(carte.chakra);
  });

  it('une remise de groupe fait baisser le prix minimal', () => {
    const carte = getCardById('SS-047-UC') as CharacterCard;
    expect(coutMinimalPourPoser(plateau(30, 1), 'player1', carte)).toBe((carte.chakra ?? 0) - 1);
    expect(coutMinimalPourPoser(plateau(30, 2), 'player1', carte)).toBe(Math.max(0, (carte.chakra ?? 0) - 2));
  });

  it('a zero Chakra, une carte tombee a zero reste jouable', () => {
    const yashamaru = getCardById('KS-084-C') as CharacterCard;
    expect(yashamaru.chakra).toBe(1);
    const sansRemise = plateau(0, 0);
    const avecRemise = plateau(0, 1);
    expect(coutMinimalPourPoser(sansRemise, 'player1', yashamaru)).toBe(1);
    expect(0 >= coutMinimalPourPoser(sansRemise, 'player1', yashamaru)).toBe(false);
    expect(coutMinimalPourPoser(avecRemise, 'player1', yashamaru)).toBe(0);
    expect(0 >= coutMinimalPourPoser(avecRemise, 'player1', yashamaru)).toBe(true);
  });

  it('le prix minimal ne depasse jamais le prix de la meilleure mission', () => {
    const carte = getCardById('SS-047-UC') as CharacterCard;
    const state = plateau(30, 1);
    const parMission = state.activeMissions.map((_, i) => calculateEffectiveCost(state, 'player1', carte, i, false));
    expect(coutMinimalPourPoser(state, 'player1', carte)).toBe(Math.min(...parMission));
  });

  it('un prix negatif est impossible', () => {
    const yashamaru = getCardById('KS-084-C') as CharacterCard;
    expect(coutMinimalPourPoser(plateau(30, 3), 'player1', yashamaru)).toBe(0);
  });

  it('sans mission ni etat, le prix imprime sert de repli', () => {
    const carte = getCardById('SS-047-UC') as CharacterCard;
    expect(coutMinimalPourPoser({}, 'player1', carte)).toBe(carte.chakra);
    expect(coutMinimalPourPoser({ activeMissions: [] }, 'player1', carte)).toBe(carte.chakra);
  });

  it('la main ne compare plus le Chakra au prix imprime', () => {
    const source = readFileSync(join(RACINE, 'components/game/PlayerHand.tsx'), 'utf8');
    expect(source, 'la comparaison brute au cout imprime est le bug').not.toContain('chakra >= card.chakra');
    expect(source).toContain('coutMinimalPourPoser');
    expect(source, 'le chemin amelioration compte aussi').toContain('canAffordAsUpgrade');
  });
});
