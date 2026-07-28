import { describe, it, expect } from 'vitest';
import { isUpgradeNameLegal, checkFlexibleUpgrade, validateUpgradeCharacter } from '@/lib/engine/rules/PlayValidation';
import { calculateEffectiveCost } from '@/lib/engine/rules/ChakraValidation';
import { getCharacterById } from '@/lib/data/cardIndex';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { triggerOnDefeatEffects } from '@/lib/effects/onDefeatTriggers';
import type { CharacterCard } from '@/lib/engine/types';

const ICHIBI = 'SS-047-UC';
const GAARA = 'SS-046-UC';
const RASA = 'SS-051-UC';

describe('One-Tail SS-047 upgrades over Gaara from hand, not only from hidden', () => {
  it('the shared rule accepts One-Tail over Gaara', () => {
    const ichibi = getCharacterById(ICHIBI) as CharacterCard;
    const gaara = getCharacterById(GAARA) as CharacterCard;
    expect(ichibi).toBeTruthy();
    expect(gaara).toBeTruthy();
    expect(gaara.name_fr.toUpperCase()).toBe('GAARA');

    expect(checkFlexibleUpgrade(ichibi, gaara), 'flexible upgrade must be allowed').toBe(true);
    expect(isUpgradeNameLegal(ichibi, gaara), 'the hand play path must allow it too').toBe(true);
  });

  it('the engine validates the upgrade when One-Tail is played from hand', () => {
    const gaaraInPlay = simChar(GAARA, { owner: 'player1', instanceId: 'gaara-1' });
    const state = buildSimState({ p1: [gaaraInPlay], missions: 2, chakra1: 20, edgeHolder: 'player1' });
    state.phase = 'action';

    const ichibi = getCharacterById(ICHIBI) as CharacterCard;
    const result = validateUpgradeCharacter(state, 'player1', ichibi, 0, 'gaara-1');

    expect(result.reason ?? '').not.toContain('same character name');
    expect(result.valid, 'playing One-Tail from hand over Gaara must be legal').toBe(true);
  });

  it('a plain different-named character still cannot upgrade', () => {
    const gaara = getCharacterById(GAARA) as CharacterCard;
    const unrelated = getCharacterById('KS-001-C') as CharacterCard;
    expect(isUpgradeNameLegal(unrelated, gaara)).toBe(false);
  });
});

describe('Gaara SS-078 offers one draw per copy in play', () => {
  function promptsForGaaraCount(count: number): number {
    const p1 = [];
    for (let i = 0; i < count; i++) {
      p1.push(simChar('SS-078-UC', { owner: 'player1', instanceId: `gaara78-${i}`, missionIndex: i }));
    }
    const victim = simChar('KS-001-C', { owner: 'player2', instanceId: 'victim' });
    const state = buildSimState({ p1, p2: [victim], missions: 4, chakra1: 30, edgeHolder: 'player1' });
    state.phase = 'action';
    for (let i = 1; i < count; i++) {
      state.activeMissions[0].player1Characters =
        state.activeMissions[0].player1Characters.filter((c) => c.instanceId !== `gaara78-${i}`);
      state.activeMissions[i].player1Characters.push(p1[i]);
    }
    state.player1.deck = [getCharacterById('KS-003-C') as CharacterCard, getCharacterById('KS-005-C') as CharacterCard];

    const after = triggerOnDefeatEffects(state, victim, 'player2');
    return after.pendingActions.filter((a) => a.descriptionKey === 'game.effect.desc.ss078ConfirmDraw').length;
  }

  it('one Gaara offers one draw', () => {
    expect(promptsForGaaraCount(1)).toBe(1);
  });

  it('two Gaara offer two separate draws', () => {
    expect(promptsForGaaraCount(2), 'each Gaara triggers on its own').toBe(2);
  });
});

describe('Rasa SS-051 cost reduction stacks with several Rasa in play', () => {
  function costWithRasas(count: number): number {
    const p1 = [];
    for (let i = 0; i < count; i++) {
      p1.push(simChar(RASA, { owner: 'player1', instanceId: `rasa-${i}`, missionIndex: i }));
    }
    const state = buildSimState({ p1, missions: 4, chakra1: 30, edgeHolder: 'player1' });
    state.phase = 'action';
    if (count > 1) {
      for (let i = 1; i < count; i++) {
        state.activeMissions[0].player1Characters =
          state.activeMissions[0].player1Characters.filter((c) => c.instanceId !== `rasa-${i}`);
        state.activeMissions[i].player1Characters.push(p1[i]);
      }
    }
    const sandCard = getCharacterById(GAARA) as CharacterCard;
    expect(sandCard.group).toBe('Sand Village');
    return calculateEffectiveCost(state, 'player1', sandCard, 3, false);
  }

  it('one Rasa reduces a Sand Village cost by 1', () => {
    const base = (getCharacterById(GAARA) as CharacterCard).chakra;
    expect(costWithRasas(1)).toBe(Math.max(0, base - 1));
  });

  it('two Rasa reduce it by 2', () => {
    const base = (getCharacterById(GAARA) as CharacterCard).chakra;
    expect(costWithRasas(2), 'several Rasa must stack').toBe(Math.max(0, base - 2));
  });
});
