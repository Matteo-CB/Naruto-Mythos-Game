import { describe, it, expect } from 'vitest';
import { GameEngine } from '../engine/GameEngine';
import { executeStartPhase } from '../engine/phases/StartPhase';
import { executeEndPhase, returnCharacterToHand } from '../engine/phases/EndPhase';
import { executeMissionPhase } from '../engine/phases/MissionPhase';
import { calculateCharacterPower } from '../engine/phases/PowerCalculation';
import { validateUpgradeCharacter } from '../engine/rules/PlayValidation';
import { EffectEngine } from '../effects/EffectEngine';
import { defeatFriendlyCharacter, defeatEnemyCharacter } from '../effects/defeatUtils';
import { getValidTargets } from '../effects/TargetResolver';
import { RANK_BONUS, BASE_CHAKRA_PER_TURN, CARDS_DRAWN_PER_TURN, TOTAL_TURNS } from '../engine/types';
import type {
  GameState,
  MissionRank,
  PlayerID,
  CharacterInPlay,
  CharacterCard,
  TurnNumber,
} from '../engine/types';
import { createActionPhaseState, mockCharacter, mockCharInPlay, mockMission } from './testHelpers';

const CHAKRA_PLUS_ONE_CARD: Partial<CharacterCard> = {
  id: 'KS-005-C',
  set: 'KS',
  number: 5,
  name_fr: 'Genin Ravitailleur',
  chakra: 2,
  power: 1,
  effects: [{ type: 'MAIN', description: '[⧗] CHAKRA +1' }],
};

function withMissions(ranks: MissionRank[]): GameState {
  const state = createActionPhaseState();
  state.activeMissions = ranks.map((rank, i) => ({
    card: mockMission({ id: `KS-MSS-0${i + 1}`, name_fr: `Mission ${rank}`, basePoints: 2 }),
    rank,
    basePoints: 2,
    rankBonus: RANK_BONUS[rank],
    player1Characters: [],
    player2Characters: [],
    wonBy: null,
  }));
  return state;
}

function placeChar(
  state: GameState,
  player: PlayerID,
  missionIndex: number,
  overrides: Partial<CharacterInPlay> = {},
  cardOverrides: Partial<CharacterCard> = {},
): CharacterInPlay {
  const char = mockCharInPlay(
    {
      controlledBy: player,
      originalOwner: player,
      ...overrides,
      missionIndex,
    },
    cardOverrides,
  );
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  state.activeMissions[missionIndex][side].push(char);
  state[player].charactersInPlay += 1;
  return char;
}

function logActions(state: GameState, action: string): typeof state.log {
  return state.log.filter((l) => l.action === action);
}

describe('AUDIT engine core rules', () => {
  describe('Start phase: 5 chakra plus 1 per controlled character', () => {
    it('grants exactly the base 5 chakra when no character is in play', () => {
      const state = withMissions(['D']);
      state.player1.chakra = 0;
      state.player2.chakra = 0;

      const after = executeStartPhase(state);

      expect(after.player1.chakra).toBe(BASE_CHAKRA_PER_TURN);
      expect(after.player2.chakra).toBe(BASE_CHAKRA_PER_TURN);
    });

    it('adds 1 chakra per face-up character controlled', () => {
      const state = withMissions(['D']);
      state.player1.chakra = 0;
      placeChar(state, 'player1', 0, {}, { name_fr: 'A' });
      placeChar(state, 'player1', 0, {}, { name_fr: 'B' });
      placeChar(state, 'player1', 0, {}, { name_fr: 'C' });

      const after = executeStartPhase(state);

      expect(after.player1.chakra).toBe(BASE_CHAKRA_PER_TURN + 3);
    });

    it('counts HIDDEN characters toward the per-character chakra', () => {
      const state = withMissions(['D']);
      state.player1.chakra = 0;
      placeChar(state, 'player1', 0, { isHidden: true }, { name_fr: 'HiddenOne' });
      placeChar(state, 'player1', 0, { isHidden: true }, { name_fr: 'HiddenTwo' });

      const after = executeStartPhase(state);

      expect(after.player1.chakra).toBe(BASE_CHAKRA_PER_TURN + 2);
    });

    it('mixes hidden and face-up characters in the same count', () => {
      const state = withMissions(['D']);
      state.player1.chakra = 0;
      placeChar(state, 'player1', 0, { isHidden: true }, { name_fr: 'HiddenOne' });
      placeChar(state, 'player1', 0, {}, { name_fr: 'Visible' });

      const after = executeStartPhase(state);

      expect(after.player1.chakra).toBe(BASE_CHAKRA_PER_TURN + 2);
    });

    it('sums characters across every active mission', () => {
      const state = withMissions(['D', 'C', 'B']);
      state.player1.chakra = 0;
      placeChar(state, 'player1', 0, {}, { name_fr: 'A' });
      placeChar(state, 'player1', 1, {}, { name_fr: 'B' });
      placeChar(state, 'player1', 2, {}, { name_fr: 'C' });

      const after = executeStartPhase(state);

      expect(after.player1.chakra).toBe(BASE_CHAKRA_PER_TURN + 3);
    });

    it('never counts the opponent characters for your chakra', () => {
      const state = withMissions(['D']);
      state.player1.chakra = 0;
      state.player2.chakra = 0;
      placeChar(state, 'player2', 0, {}, { name_fr: 'EnemyA' });
      placeChar(state, 'player2', 0, {}, { name_fr: 'EnemyB' });

      const after = executeStartPhase(state);

      expect(after.player1.chakra).toBe(BASE_CHAKRA_PER_TURN);
      expect(after.player2.chakra).toBe(BASE_CHAKRA_PER_TURN + 2);
    });

    it('counts a controlled enemy card sitting on your side as one of your characters', () => {
      const state = withMissions(['D']);
      state.player1.chakra = 0;
      state.player2.chakra = 0;
      placeChar(state, 'player1', 0, { controlledBy: 'player1', originalOwner: 'player2' }, { name_fr: 'Stolen' });

      const after = executeStartPhase(state);

      expect(after.player1.chakra).toBe(BASE_CHAKRA_PER_TURN + 1);
      expect(after.player2.chakra).toBe(BASE_CHAKRA_PER_TURN);
    });

    it('stacks a CHAKRA +X continuous effect on top of base plus character count', () => {
      const state = withMissions(['D']);
      state.player1.chakra = 0;
      placeChar(state, 'player1', 0, {}, CHAKRA_PLUS_ONE_CARD);

      const after = executeStartPhase(state);

      expect(after.player1.chakra).toBe(BASE_CHAKRA_PER_TURN + 1 + 1);
      expect(logActions(after, 'CHAKRA_BONUS').length).toBe(1);
    });

    it('does not apply a CHAKRA +X effect while its source is hidden, but still counts the body', () => {
      const state = withMissions(['D']);
      state.player1.chakra = 0;
      placeChar(state, 'player1', 0, { isHidden: true }, CHAKRA_PLUS_ONE_CARD);

      const after = executeStartPhase(state);

      expect(after.player1.chakra).toBe(BASE_CHAKRA_PER_TURN + 1);
      expect(logActions(after, 'CHAKRA_BONUS').length).toBe(0);
    });

    it('adds the new chakra to the existing pool instead of overwriting it', () => {
      const state = withMissions(['D']);
      state.player1.chakra = 3;

      const after = executeStartPhase(state);

      expect(after.player1.chakra).toBe(3 + BASE_CHAKRA_PER_TURN);
    });

    it('reveals the top mission of the mission deck with the rank of the current round', () => {
      const state = withMissions(['D']);
      state.turn = 2 as TurnNumber;
      const deckBefore = state.missionDeck.length;

      const after = executeStartPhase(state);

      expect(after.activeMissions.length).toBe(2);
      expect(after.missionDeck.length).toBe(deckBefore - 1);
      expect(after.activeMissions[1].rank).toBe('C');
      expect(after.activeMissions[1].rankBonus).toBe(RANK_BONUS['C']);
      expect(after.turnMissionRevealed).toBe(true);
    });
  });

  describe('Start phase: draw 2, nothing on an empty deck', () => {
    it('draws exactly 2 cards for each player', () => {
      const state = withMissions(['D']);
      const p1Hand = state.player1.hand.length;
      const p2Hand = state.player2.hand.length;
      const p1Deck = state.player1.deck.length;

      const after = executeStartPhase(state);

      expect(after.player1.hand.length).toBe(p1Hand + CARDS_DRAWN_PER_TURN);
      expect(after.player2.hand.length).toBe(p2Hand + CARDS_DRAWN_PER_TURN);
      expect(after.player1.deck.length).toBe(p1Deck - CARDS_DRAWN_PER_TURN);
    });

    it('draws from the top of the deck preserving order', () => {
      const state = withMissions(['D']);
      const top0 = state.player1.deck[0];
      const top1 = state.player1.deck[1];
      const handSize = state.player1.hand.length;

      const after = executeStartPhase(state);

      expect(after.player1.hand[handSize].id).toBe(top0.id);
      expect(after.player1.hand[handSize + 1].id).toBe(top1.id);
      expect(after.player1.deck[0].id).not.toBe(top0.id);
    });

    it('does nothing at all when the deck is empty (no crash, no hand change)', () => {
      const state = withMissions(['D']);
      state.player1.deck = [];
      const handBefore = state.player1.hand.length;

      const after = executeStartPhase(state);

      expect(after.player1.hand.length).toBe(handBefore);
      expect(after.player1.deck.length).toBe(0);
      expect(after.log.some((l) => l.messageKey === 'game.log.noDraw' && l.player === 'player1')).toBe(true);
    });

    it('draws only what is left when the deck holds a single card', () => {
      const state = withMissions(['D']);
      state.player1.deck = [mockCharacter({ id: 'KS-777-C', name_fr: 'Dernier' })];
      const handBefore = state.player1.hand.length;

      const after = executeStartPhase(state);

      expect(after.player1.hand.length).toBe(handBefore + 1);
      expect(after.player1.deck.length).toBe(0);
    });

    it('an empty deck for one player does not stop the other from drawing', () => {
      const state = withMissions(['D']);
      state.player1.deck = [];
      const p2Hand = state.player2.hand.length;

      const after = executeStartPhase(state);

      expect(after.player2.hand.length).toBe(p2Hand + CARDS_DRAWN_PER_TURN);
    });
  });

  describe('Action phase: alternation, first passer takes the Edge', () => {
    it('hands the turn to the opponent after a normal play', () => {
      const state = withMissions(['D']);
      state.activePlayer = 'player1';

      const after = GameEngine.applyAction(state, 'player1', {
        type: 'PLAY_CHARACTER', cardIndex: 4, missionIndex: 0, hidden: false,
      });

      expect(after.activePlayer).toBe('player2');
      expect(after.activeMissions[0].player1Characters.length).toBe(1);
    });

    it('refuses an action from the player who is not active', () => {
      const state = withMissions(['D']);
      state.activePlayer = 'player1';

      const after = GameEngine.applyAction(state, 'player2', {
        type: 'PLAY_CHARACTER', cardIndex: 4, missionIndex: 0, hidden: false,
      });

      expect(after.activeMissions[0].player2Characters.length).toBe(0);
      expect(after.player2.chakra).toBe(state.player2.chakra);
      expect(after.activePlayer).toBe('player1');
    });

    it('gives the Edge to the first player who passes', () => {
      const state = withMissions(['D']);
      state.edgeHolder = 'player1';
      state.activePlayer = 'player2';

      const after = GameEngine.applyAction(state, 'player2', { type: 'PASS' });

      expect(after.player2.hasPassed).toBe(true);
      expect(after.firstPasser).toBe('player2');
      expect(after.edgeHolder).toBe('player2');
      expect(after.log.some((l) => l.messageKey === 'game.log.passEdge')).toBe(true);
    });

    it('refuses a PASS from the player whose turn it is not', () => {
      const state = withMissions(['D']);
      state.edgeHolder = 'player1';
      state.activePlayer = 'player1';

      const after = GameEngine.applyAction(state, 'player2', { type: 'PASS' });

      expect(after.player2.hasPassed).toBe(false);
      expect(after.firstPasser).toBeNull();
      expect(after.edgeHolder).toBe('player1');
    });

    it('lets the first passer KEEP an Edge they already held', () => {
      const state = withMissions(['D']);
      state.edgeHolder = 'player1';
      state.activePlayer = 'player1';

      const after = GameEngine.applyAction(state, 'player1', { type: 'PASS' });

      expect(after.edgeHolder).toBe('player1');
      expect(after.firstPasser).toBe('player1');
    });

    it('does not give the Edge to the second passer', () => {
      let state = withMissions(['D']);
      state.edgeHolder = 'player1';
      state.activePlayer = 'player2';

      state = GameEngine.applyAction(state, 'player2', { type: 'PASS' });
      expect(state.edgeHolder).toBe('player2');
      expect(state.activePlayer).toBe('player1');

      state = GameEngine.applyAction(state, 'player1', { type: 'PASS' });

      expect(state.edgeHolder).toBe('player2');
      expect(state.firstPasser).toBe('player2');
      expect(state.log.filter((l) => l.messageKey === 'game.log.passEdge').length).toBe(1);
    });

    it('passes the turn to the other player when only one has passed', () => {
      const state = withMissions(['D']);
      state.activePlayer = 'player1';

      const after = GameEngine.applyAction(state, 'player1', { type: 'PASS' });

      expect(after.activePlayer).toBe('player2');
      expect(after.phase).toBe('action');
    });

    it('lets the non-passed player keep acting alone, turn after turn', () => {
      let state = withMissions(['D']);
      state.activePlayer = 'player1';
      state.player2.chakra = 20;

      state = GameEngine.applyAction(state, 'player1', { type: 'PASS' });
      expect(state.activePlayer).toBe('player2');

      state = GameEngine.applyAction(state, 'player2', {
        type: 'PLAY_CHARACTER', cardIndex: 4, missionIndex: 0, hidden: false,
      });
      expect(state.activePlayer).toBe('player2');
      expect(state.activeMissions[0].player2Characters.length).toBe(1);

      state = GameEngine.applyAction(state, 'player2', {
        type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
      });
      expect(state.activePlayer).toBe('player2');
      expect(state.activeMissions[0].player2Characters.length).toBe(2);
    });

    it('blocks any further action from a player who already passed', () => {
      let state = withMissions(['D']);
      state.activePlayer = 'player1';

      state = GameEngine.applyAction(state, 'player1', { type: 'PASS' });
      const chakraBefore = state.player1.chakra;

      state = GameEngine.applyAction(state, 'player1', {
        type: 'PLAY_CHARACTER', cardIndex: 4, missionIndex: 0, hidden: false,
      });

      expect(state.activeMissions[0].player1Characters.length).toBe(0);
      expect(state.player1.chakra).toBe(chakraBefore);
      expect(GameEngine.getValidActions(state, 'player1').length).toBe(0);
    });

    it('leaves the action phase once both players have passed', () => {
      let state = withMissions(['D']);
      state.activePlayer = 'player1';

      state = GameEngine.applyAction(state, 'player1', { type: 'PASS' });
      state = GameEngine.applyAction(state, 'player2', { type: 'PASS' });

      expect(state.phase).not.toBe('action');
      expect(state.player1.hasPassed).toBe(true);
      expect(state.player2.hasPassed).toBe(true);
    });

    it('charges exactly 1 chakra for a hidden play whatever the printed cost', () => {
      const state = withMissions(['D']);
      state.activePlayer = 'player1';
      state.player1.chakra = 4;
      state.player1.hand = [mockCharacter({ id: 'KS-905-C', name_fr: 'Couteux', chakra: 5, power: 5 })];

      const after = GameEngine.applyAction(state, 'player1', {
        type: 'PLAY_HIDDEN', cardIndex: 0, missionIndex: 0,
      });

      expect(after.player1.chakra).toBe(3);
      expect(after.activeMissions[0].player1Characters[0].isHidden).toBe(true);
      expect(after.activeMissions[0].player1Characters[0].wasRevealedAtLeastOnce).toBe(false);
    });
  });

  describe('Mission phase: rank order, ties, minimum power', () => {
    it('scores missions in strict D, C, B, A order whatever the array order', () => {
      const state = withMissions(['A', 'B', 'C', 'D']);
      for (let i = 0; i < 4; i++) {
        placeChar(state, 'player1', i, {}, { name_fr: `Hero${i}`, power: 3 });
      }

      const after = executeMissionPhase(state);
      const order = logActions(after, 'SCORE_MISSION').map((l) => l.messageParams?.rank);

      expect(order).toEqual(['D', 'C', 'B', 'A']);
    });

    it('awards base points plus the rank bonus to the mission winner', () => {
      const state = withMissions(['B']);
      placeChar(state, 'player1', 0, {}, { name_fr: 'Hero', power: 3 });

      const after = executeMissionPhase(state);

      expect(after.activeMissions[0].wonBy).toBe('player1');
      expect(after.player1.missionPoints).toBe(2 + RANK_BONUS['B']);
      expect(after.player2.missionPoints).toBe(0);
    });

    it('accumulates points across all four missions in one scoring pass', () => {
      const state = withMissions(['A', 'B', 'C', 'D']);
      for (let i = 0; i < 4; i++) {
        placeChar(state, 'player1', i, {}, { name_fr: `Hero${i}`, power: 3 });
      }

      const after = executeMissionPhase(state);

      expect(after.player1.missionPoints).toBe((2 + 4) + (2 + 3) + (2 + 2) + (2 + 1));
    });

    it('gives the mission to the higher total Power, tokens included', () => {
      const state = withMissions(['D']);
      placeChar(state, 'player1', 0, { powerTokens: 2 }, { name_fr: 'Faible', power: 1 });
      placeChar(state, 'player2', 0, {}, { name_fr: 'Fort', power: 3 });
      state.edgeHolder = 'player2';

      const after = executeMissionPhase(state);

      expect(after.activeMissions[0].wonBy).toBe('player2');

      const state2 = withMissions(['D']);
      placeChar(state2, 'player1', 0, { powerTokens: 3 }, { name_fr: 'Faible', power: 1 });
      placeChar(state2, 'player2', 0, {}, { name_fr: 'Fort', power: 3 });
      state2.edgeHolder = 'player2';

      const after2 = executeMissionPhase(state2);
      expect(after2.activeMissions[0].wonBy).toBe('player1');
    });

    it('breaks an equal-power tie in favour of the Edge holder', () => {
      const state = withMissions(['D']);
      state.edgeHolder = 'player2';
      placeChar(state, 'player1', 0, {}, { name_fr: 'Un', power: 3 });
      placeChar(state, 'player2', 0, {}, { name_fr: 'Deux', power: 3 });

      const after = executeMissionPhase(state);

      expect(after.activeMissions[0].wonBy).toBe('player2');
      expect(after.player2.missionPoints).toBe(2 + RANK_BONUS['D']);
      expect(after.player1.missionPoints).toBe(0);
      expect(logActions(after, 'TIE_BREAK').length).toBe(1);
    });

    it('gives the tie to the other player when the Edge changes hands', () => {
      const state = withMissions(['D']);
      state.edgeHolder = 'player1';
      placeChar(state, 'player1', 0, {}, { name_fr: 'Un', power: 3 });
      placeChar(state, 'player2', 0, {}, { name_fr: 'Deux', power: 3 });

      const after = executeMissionPhase(state);

      expect(after.activeMissions[0].wonBy).toBe('player1');
    });

    it('requires at least 1 Power: an empty board wins nothing', () => {
      const state = withMissions(['D']);
      state.edgeHolder = 'player1';

      const after = executeMissionPhase(state);

      expect(after.activeMissions[0].wonBy).toBe('draw');
      expect(after.player1.missionPoints).toBe(0);
      expect(after.player2.missionPoints).toBe(0);
      expect(logActions(after, 'NO_WINNER').length).toBe(1);
      expect(logActions(after, 'WIN_MISSION').length).toBe(0);
    });

    it('a lone hidden character at 0 Power cannot win the mission even with the Edge', () => {
      const state = withMissions(['D']);
      state.edgeHolder = 'player1';
      placeChar(state, 'player1', 0, { isHidden: true }, { name_fr: 'Cachee', power: 9 });

      const after = executeMissionPhase(state);

      expect(after.activeMissions[0].wonBy).toBe('draw');
      expect(after.player1.missionPoints).toBe(0);
    });

    it('a hidden character carrying power tokens CAN win the mission', () => {
      const state = withMissions(['D']);
      state.edgeHolder = 'player2';
      placeChar(state, 'player1', 0, { isHidden: true, powerTokens: 1 }, { name_fr: 'Cachee', power: 0 });

      const after = executeMissionPhase(state);

      expect(after.activeMissions[0].wonBy).toBe('player1');
      expect(after.player1.missionPoints).toBe(2 + RANK_BONUS['D']);
    });

    it('triggers no SCORE resolution at all when nobody wins the mission', () => {
      const state = withMissions(['D']);
      state.activeMissions[0].card = mockMission({
        id: 'KS-MSS-09',
        name_fr: 'Mission Score',
        basePoints: 2,
        effects: [{ type: 'SCORE', description: 'Draw 1 card.' }],
      });

      const after = executeMissionPhase(state);

      expect(after.activeMissions[0].wonBy).toBe('draw');
      expect(after.pendingEffects.length).toBe(0);
      expect(after.pendingActions.length).toBe(0);
      expect(after.missionScoringProgress).toBeUndefined();
      expect(after.player1.hand.length).toBe(state.player1.hand.length);
    });

    it('re-scores every mission each round by resetting wonBy first', () => {
      const state = withMissions(['D', 'C']);
      state.phase = 'action';
      state.activeMissions[0].wonBy = 'player1';
      state.activeMissions[1].wonBy = 'player1';
      placeChar(state, 'player2', 0, {}, { name_fr: 'Sable', power: 4 });

      const after = GameEngine.transitionToMissionPhase(state);

      expect(after.activeMissions[0].wonBy).toBe('player2');
      expect(after.activeMissions[1].wonBy).toBe('draw');
      expect(after.player2.missionPoints).toBe(2 + RANK_BONUS['D']);
      expect(after.player1.missionPoints).toBe(0);
    });

    it('skips a rank that has no mission on the board without crashing', () => {
      const state = withMissions(['D', 'A']);
      placeChar(state, 'player1', 1, {}, { name_fr: 'Elite', power: 5 });

      const after = executeMissionPhase(state);
      const order = logActions(after, 'SCORE_MISSION').map((l) => l.messageParams?.rank);

      expect(order).toEqual(['D', 'A']);
      expect(after.player1.missionPoints).toBe(2 + RANK_BONUS['A']);
    });
  });

  describe('End phase: chakra discarded, power tokens removed', () => {
    it('empties both chakra pools down to 0', () => {
      const state = withMissions(['D']);
      state.player1.chakra = 7;
      state.player2.chakra = 3;

      const after = executeEndPhase(state);

      expect(after.player1.chakra).toBe(0);
      expect(after.player2.chakra).toBe(0);
      expect(logActions(after, 'RESET_CHAKRA').length).toBe(1);
    });

    it('removes every power token from every character on both sides', () => {
      const state = withMissions(['D', 'C']);
      const a = placeChar(state, 'player1', 0, { powerTokens: 3 }, { name_fr: 'A', power: 2 });
      const b = placeChar(state, 'player2', 0, { powerTokens: 5 }, { name_fr: 'B', power: 2 });
      const c = placeChar(state, 'player1', 1, { powerTokens: 1 }, { name_fr: 'C', power: 2 });

      const after = executeEndPhase(state);

      const find = (id: string): CharacterInPlay | undefined => {
        for (const m of after.activeMissions) {
          const hit = [...m.player1Characters, ...m.player2Characters].find((ch) => ch.instanceId === id);
          if (hit) return hit;
        }
        return undefined;
      };

      expect(find(a.instanceId)!.powerTokens).toBe(0);
      expect(find(b.instanceId)!.powerTokens).toBe(0);
      expect(find(c.instanceId)!.powerTokens).toBe(0);
      expect(logActions(after, 'REMOVE_TOKENS').length).toBe(1);
    });

    it('removes power tokens from hidden characters too', () => {
      const state = withMissions(['D']);
      const hidden = placeChar(state, 'player1', 0, { isHidden: true, powerTokens: 4 }, { name_fr: 'Cachee' });

      const after = executeEndPhase(state);
      const stillHidden = after.activeMissions[0].player1Characters.find((c) => c.instanceId === hidden.instanceId);

      expect(stillHidden!.powerTokens).toBe(0);
      expect(stillHidden!.isHidden).toBe(true);
    });

    it('leaves characters, hands and discard piles untouched by the cleanup', () => {
      const state = withMissions(['D']);
      placeChar(state, 'player1', 0, { powerTokens: 2 }, { name_fr: 'A', power: 2 });
      const handBefore = state.player1.hand.length;
      const discardBefore = state.player1.discardPile.length;

      const after = executeEndPhase(state);

      expect(after.activeMissions[0].player1Characters.length).toBe(1);
      expect(after.player1.hand.length).toBe(handBefore);
      expect(after.player1.discardPile.length).toBe(discardBefore);
    });
  });

  describe('Round transitions and end of game', () => {
    it('rolls into the next round: chakra reset then granted again, mission of the new rank revealed', () => {
      const state = withMissions(['D']);
      state.phase = 'mission';
      state.turn = 1 as TurnNumber;
      state.player1.chakra = 9;
      state.player1.hasPassed = true;
      state.player2.hasPassed = true;
      state.firstPasser = 'player2';
      state.edgeHolder = 'player2';
      placeChar(state, 'player1', 0, {}, { name_fr: 'Garde', power: 2 });

      const after = GameEngine.transitionToEndPhase(state);

      expect(after.turn).toBe(2);
      expect(after.phase).toBe('action');
      expect(after.player1.hasPassed).toBe(false);
      expect(after.player2.hasPassed).toBe(false);
      expect(after.firstPasser).toBeNull();
      expect(after.activePlayer).toBe('player2');
      expect(after.player1.chakra).toBe(BASE_CHAKRA_PER_TURN + 1);
      expect(after.player2.chakra).toBe(BASE_CHAKRA_PER_TURN);
      expect(after.activeMissions.length).toBe(2);
      expect(after.activeMissions[1].rank).toBe('C');
    });

    it('ends the game after the last round instead of starting a fifth', () => {
      const state = withMissions(['D', 'C', 'B', 'A']);
      state.phase = 'mission';
      state.turn = TOTAL_TURNS as TurnNumber;
      state.player1.missionPoints = 12;
      state.player2.missionPoints = 9;

      const after = GameEngine.transitionToEndPhase(state);

      expect(after.phase).toBe('gameOver');
      expect(after.turn).toBe(TOTAL_TURNS);
      expect(GameEngine.getWinner(after)).toBe('player1');
    });

    it('breaks the final score tie with the Edge token', () => {
      const state = withMissions(['D', 'C', 'B', 'A']);
      state.phase = 'mission';
      state.turn = TOTAL_TURNS as TurnNumber;
      state.edgeHolder = 'player2';
      state.player1.missionPoints = 11;
      state.player2.missionPoints = 11;

      const after = GameEngine.transitionToEndPhase(state);

      expect(after.phase).toBe('gameOver');
      expect(GameEngine.getWinner(after)).toBe('player2');
    });

    it('reports no winner while the game is still running', () => {
      const state = withMissions(['D']);
      expect(GameEngine.getWinner(state)).toBeNull();
    });
  });

  describe('Hidden characters: 0 cost, 0 Power, no visible identity, but real tokens', () => {
    it('counts as Power 0 whatever the printed power', () => {
      const state = withMissions(['D']);
      const hidden = placeChar(state, 'player1', 0, { isHidden: true }, { name_fr: 'Monstre', power: 9 });

      expect(calculateCharacterPower(state, hidden, 'player1')).toBe(0);
    });

    it('counts its power tokens on top of a 0 base, for its own controller', () => {
      const state = withMissions(['D']);
      const hidden = placeChar(state, 'player1', 0, { isHidden: true, powerTokens: 3 }, { name_fr: 'Monstre', power: 9 });

      expect(calculateCharacterPower(state, hidden, 'player1')).toBe(3);
    });

    it('is a legal target for a power-X-or-less effect because 0 plus tokens is compared', () => {
      const state = withMissions(['D']);
      placeChar(state, 'player2', 0, { isHidden: true }, { name_fr: 'Monstre', power: 9 });

      const targets = getValidTargets(state, 'player1', 'enemy_character', 0, { maxPower: 1 });

      expect(targets.length).toBe(1);
    });

    it('falls out of a power-X-or-less effect once its tokens push it above the threshold', () => {
      const state = withMissions(['D']);
      placeChar(state, 'player2', 0, { isHidden: true, powerTokens: 4 }, { name_fr: 'Monstre', power: 0 });

      const targets = getValidTargets(state, 'player1', 'enemy_character', 0, { maxPower: 3 });

      expect(targets.length).toBe(0);
    });

    it('is treated as cost 0 by an enemy cost-limited effect', () => {
      const state = withMissions(['D']);
      placeChar(state, 'player2', 0, { isHidden: true }, { name_fr: 'Monstre', chakra: 7 });

      const targets = getValidTargets(state, 'player1', 'enemy_character', 0, { maxCost: 0 });

      expect(targets.length).toBe(1);
    });

    it('exposes no group and no keyword to an enemy effect that filters on them', () => {
      const state = withMissions(['D']);
      placeChar(
        state, 'player2', 0,
        { isHidden: true },
        { name_fr: 'Monstre', group: 'Leaf Village', keywords: ['Team 7'] },
      );

      expect(getValidTargets(state, 'player1', 'enemy_character', 0, { group: 'Leaf Village' }).length).toBe(0);
      expect(getValidTargets(state, 'player1', 'enemy_character', 0, { keyword: 'Team 7' }).length).toBe(0);
    });

    it('a friendly group filter cannot see the group of a hidden ally', () => {
      const state = withMissions(['D']);
      placeChar(
        state, 'player1', 0,
        { isHidden: true },
        { name_fr: 'Allie', group: 'Leaf Village', keywords: ['Team 7'] },
      );

      expect(getValidTargets(state, 'player1', 'friendly_character', 0, { group: 'Leaf Village' }).length).toBe(0);
    });

    it('a hidden ally counts as cost 0 for a friendly cost filter', () => {
      const state = withMissions(['D']);
      placeChar(state, 'player1', 0, { isHidden: true }, { name_fr: 'Allie', chakra: 7 });

      expect(getValidTargets(state, 'player1', 'friendly_character', 0, { maxCost: 0 }).length).toBe(1);
    });

    it('keeps its power tokens when it is hidden by an effect and when it is revealed again', () => {
      const state = withMissions(['D']);
      const visible = placeChar(state, 'player1', 0, { powerTokens: 2 }, { name_fr: 'Bascule', power: 4 });

      expect(calculateCharacterPower(state, visible, 'player1')).toBe(6);

      const hiddenState = EffectEngine.hideCharacter(state, visible.instanceId);
      const nowHidden = hiddenState.activeMissions[0].player1Characters[0];

      expect(nowHidden.isHidden).toBe(true);
      expect(nowHidden.powerTokens).toBe(2);
      expect(calculateCharacterPower(hiddenState, nowHidden, 'player1')).toBe(2);

      hiddenState.player1.chakra = 10;
      hiddenState.activePlayer = 'player1';
      const revealed = GameEngine.applyAction(hiddenState, 'player1', {
        type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: visible.instanceId,
      });
      const back = revealed.activeMissions[0].player1Characters[0];

      expect(back.isHidden).toBe(false);
      expect(back.wasRevealedAtLeastOnce).toBe(true);
      expect(back.powerTokens).toBe(2);
      expect(calculateCharacterPower(revealed, back, 'player1')).toBe(6);
    });

    it('a hidden body still contributes nothing to the mission total until it holds tokens', () => {
      const state = withMissions(['D']);
      placeChar(state, 'player1', 0, { isHidden: true }, { name_fr: 'Un', power: 5 });
      placeChar(state, 'player1', 0, { isHidden: true }, { name_fr: 'Deux', power: 5 });
      placeChar(state, 'player2', 0, {}, { name_fr: 'Ennemi', power: 1 });

      const after = executeMissionPhase(state);

      expect(after.activeMissions[0].wonBy).toBe('player2');
    });

    it('lets two same-name hidden cards coexist on the same side of a mission', () => {
      let state = withMissions(['D']);
      state.activePlayer = 'player1';
      state.player1.chakra = 10;
      state.player1.hand = [
        mockCharacter({ id: 'KS-911-C', name_fr: 'Clone', chakra: 3 }),
        mockCharacter({ id: 'KS-911-C', name_fr: 'Clone', chakra: 3 }),
      ];

      state = GameEngine.applyAction(state, 'player1', { type: 'PLAY_HIDDEN', cardIndex: 0, missionIndex: 0 });
      state.activePlayer = 'player1';
      state = GameEngine.applyAction(state, 'player1', { type: 'PLAY_HIDDEN', cardIndex: 0, missionIndex: 0 });

      expect(state.activeMissions[0].player1Characters.length).toBe(2);
      expect(state.activeMissions[0].player1Characters.every((c) => c.isHidden)).toBe(true);
    });

    it('blocks the reveal that would create a visible same-name duplicate, with no chakra paid', () => {
      const state = withMissions(['D']);
      state.activePlayer = 'player1';
      state.player1.chakra = 10;
      placeChar(state, 'player1', 0, {}, { id: 'KS-912-C', name_fr: 'Jumeau', chakra: 3, power: 2 });
      const hidden = placeChar(state, 'player1', 0, { isHidden: true }, { id: 'KS-912-C', name_fr: 'Jumeau', chakra: 3, power: 2 });

      const after = GameEngine.applyAction(state, 'player1', {
        type: 'REVEAL_CHARACTER', missionIndex: 0, characterInstanceId: hidden.instanceId,
      });

      const stillHidden = after.activeMissions[0].player1Characters.find((c) => c.instanceId === hidden.instanceId);
      expect(stillHidden!.isHidden).toBe(true);
      expect(after.player1.chakra).toBe(10);
    });
  });

  describe('Upgrade: strictly higher cost, pay the difference, tokens transfer', () => {
    it('rejects an upgrade with an equal printed chakra cost', () => {
      const state = withMissions(['D']);
      state.activePlayer = 'player1';
      state.player1.chakra = 10;
      const target = placeChar(state, 'player1', 0, {}, { id: 'KS-920-C', name_fr: 'Ninja', chakra: 3, power: 2 });
      state.player1.hand = [mockCharacter({ id: 'KS-921-C', name_fr: 'Ninja', chakra: 3, power: 4 })];

      const check = validateUpgradeCharacter(state, 'player1', state.player1.hand[0], 0, target.instanceId);
      expect(check.valid).toBe(false);
      expect(check.reasonKey).toBe('game.error.upgradeHigherCost');

      const after = GameEngine.applyAction(state, 'player1', {
        type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: target.instanceId,
      });

      expect(after.activeMissions[0].player1Characters[0].stack.length).toBe(1);
      expect(after.player1.chakra).toBe(10);
      expect(after.player1.hand.length).toBe(1);
    });

    it('rejects an upgrade with a strictly lower printed chakra cost', () => {
      const state = withMissions(['D']);
      state.player1.chakra = 10;
      const target = placeChar(state, 'player1', 0, {}, { id: 'KS-920-C', name_fr: 'Ninja', chakra: 4, power: 2 });
      const cheaper = mockCharacter({ id: 'KS-921-C', name_fr: 'Ninja', chakra: 2, power: 9 });

      expect(validateUpgradeCharacter(state, 'player1', cheaper, 0, target.instanceId).valid).toBe(false);
    });

    it('accepts a strictly higher cost and charges only the difference', () => {
      const state = withMissions(['D']);
      state.activePlayer = 'player1';
      state.player1.chakra = 10;
      const target = placeChar(state, 'player1', 0, {}, { id: 'KS-920-C', name_fr: 'Ninja', chakra: 2, power: 2 });
      state.player1.hand = [mockCharacter({ id: 'KS-922-C', name_fr: 'Ninja', chakra: 5, power: 6 })];

      const after = GameEngine.applyAction(state, 'player1', {
        type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: target.instanceId,
      });
      const upgraded = after.activeMissions[0].player1Characters[0];

      expect(after.player1.chakra).toBe(10 - 3);
      expect(after.player1.hand.length).toBe(0);
      expect(after.activeMissions[0].player1Characters.length).toBe(1);
      expect(upgraded.stack.length).toBe(2);
      expect(upgraded.stack[1].id).toBe('KS-922-C');
      expect(upgraded.card.id).toBe('KS-922-C');
      expect(calculateCharacterPower(after, upgraded, 'player1')).toBe(6);
    });

    it('transfers the power tokens of the old card to the upgraded stack', () => {
      const state = withMissions(['D']);
      state.activePlayer = 'player1';
      state.player1.chakra = 10;
      const target = placeChar(state, 'player1', 0, { powerTokens: 3 }, { id: 'KS-920-C', name_fr: 'Ninja', chakra: 2, power: 2 });
      state.player1.hand = [mockCharacter({ id: 'KS-922-C', name_fr: 'Ninja', chakra: 5, power: 6 })];

      const after = GameEngine.applyAction(state, 'player1', {
        type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: target.instanceId,
      });
      const upgraded = after.activeMissions[0].player1Characters[0];

      expect(upgraded.powerTokens).toBe(3);
      expect(calculateCharacterPower(after, upgraded, 'player1')).toBe(9);
    });

    it('refuses the upgrade when the player cannot afford the difference', () => {
      const state = withMissions(['D']);
      state.activePlayer = 'player1';
      state.player1.chakra = 2;
      const target = placeChar(state, 'player1', 0, {}, { id: 'KS-920-C', name_fr: 'Ninja', chakra: 2, power: 2 });
      state.player1.hand = [mockCharacter({ id: 'KS-922-C', name_fr: 'Ninja', chakra: 6, power: 6 })];

      const check = validateUpgradeCharacter(state, 'player1', state.player1.hand[0], 0, target.instanceId);
      expect(check.valid).toBe(false);
      expect(check.reasonKey).toBe('game.error.notEnoughChakraUpgrade');

      const after = GameEngine.applyAction(state, 'player1', {
        type: 'UPGRADE_CHARACTER', cardIndex: 0, missionIndex: 0, targetInstanceId: target.instanceId,
      });
      expect(after.player1.chakra).toBe(2);
      expect(after.activeMissions[0].player1Characters[0].stack.length).toBe(1);
    });

    it('refuses to upgrade a character with a different name', () => {
      const state = withMissions(['D']);
      state.player1.chakra = 10;
      const target = placeChar(state, 'player1', 0, {}, { id: 'KS-920-C', name_fr: 'Ninja', chakra: 2, power: 2 });
      const other = mockCharacter({ id: 'KS-923-C', name_fr: 'Autre', chakra: 5, power: 6 });

      const check = validateUpgradeCharacter(state, 'player1', other, 0, target.instanceId);

      expect(check.valid).toBe(false);
      expect(check.reasonKey).toBe('game.error.upgradeSameName');
    });

    it('refuses to upgrade a hidden character and refuses to upgrade a controlled one', () => {
      const state = withMissions(['D']);
      state.player1.chakra = 10;
      const hidden = placeChar(state, 'player1', 0, { isHidden: true }, { id: 'KS-920-C', name_fr: 'Ninja', chakra: 2 });
      const stolen = placeChar(
        state, 'player1', 0,
        { controlledBy: 'player1', originalOwner: 'player2' },
        { id: 'KS-924-C', name_fr: 'Vole', chakra: 2, power: 2 },
      );
      const bigger = mockCharacter({ id: 'KS-922-C', name_fr: 'Ninja', chakra: 5, power: 6 });
      const biggerStolen = mockCharacter({ id: 'KS-925-C', name_fr: 'Vole', chakra: 5, power: 6 });

      expect(validateUpgradeCharacter(state, 'player1', bigger, 0, hidden.instanceId).valid).toBe(false);
      const controlledCheck = validateUpgradeCharacter(state, 'player1', biggerStolen, 0, stolen.instanceId);
      expect(controlledCheck.valid).toBe(false);
      expect(controlledCheck.reasonKey).toBe('game.error.cannotUpgradeControlled');
    });

    it('a same-name play on an existing character is routed to an upgrade, not a duplicate', () => {
      const state = withMissions(['D']);
      state.activePlayer = 'player1';
      state.player1.chakra = 10;
      placeChar(state, 'player1', 0, {}, { id: 'KS-920-C', name_fr: 'Ninja', chakra: 2, power: 2 });
      state.player1.hand = [mockCharacter({ id: 'KS-922-C', name_fr: 'Ninja', chakra: 5, power: 6 })];

      const after = GameEngine.applyAction(state, 'player1', {
        type: 'PLAY_CHARACTER', cardIndex: 0, missionIndex: 0, hidden: false,
      });

      expect(after.activeMissions[0].player1Characters.length).toBe(1);
      expect(after.activeMissions[0].player1Characters[0].stack.length).toBe(2);
      expect(after.player1.chakra).toBe(10 - 3);
    });

    it('revealing a hidden card as an upgrade pays reveal cost minus the old cost and merges the stack', () => {
      const state = withMissions(['D']);
      state.activePlayer = 'player1';
      state.player1.chakra = 10;
      const base = placeChar(state, 'player1', 0, { powerTokens: 1 }, { id: 'KS-920-C', name_fr: 'Ninja', chakra: 2, power: 2 });
      const hidden = placeChar(
        state, 'player1', 0,
        { isHidden: true, powerTokens: 2 },
        { id: 'KS-922-C', name_fr: 'Ninja', chakra: 5, power: 6 },
      );

      const after = GameEngine.applyAction(state, 'player1', {
        type: 'REVEAL_CHARACTER',
        missionIndex: 0,
        characterInstanceId: hidden.instanceId,
        upgradeTargetInstanceId: base.instanceId,
      });

      const merged = after.activeMissions[0].player1Characters;
      expect(merged.length).toBe(1);
      expect(merged[0].instanceId).toBe(base.instanceId);
      expect(merged[0].isHidden).toBe(false);
      expect(merged[0].stack.length).toBe(2);
      expect(merged[0].stack[1].id).toBe('KS-922-C');
      expect(merged[0].powerTokens).toBe(3);
      expect(after.player1.chakra).toBe(10 - 3);
    });

    it('sends the WHOLE stack to the original owner discard when the upgraded character is defeated', () => {
      const state = withMissions(['D']);
      const bottom = mockCharacter({ id: 'KS-930-C', name_fr: 'Ninja', chakra: 2, power: 2 });
      const top = mockCharacter({ id: 'KS-931-C', name_fr: 'Ninja', chakra: 5, power: 6 });
      const stack = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, stack: [bottom, top] },
        top,
      );
      state.activeMissions[0].player1Characters.push(stack);
      state.player1.charactersInPlay = 1;

      const after = defeatFriendlyCharacter(state, 0, stack.instanceId, 'player1');

      expect(after.activeMissions[0].player1Characters.length).toBe(0);
      expect(after.player1.discardPile.map((c) => c.id)).toEqual(['KS-930-C', 'KS-931-C']);
      expect(after.player1.hand.length).toBe(state.player1.hand.length);
    });

    it('sends a defeated stolen stack to the ORIGINAL owner discard, not the controller one', () => {
      const state = withMissions(['D']);
      const bottom = mockCharacter({ id: 'KS-930-C', name_fr: 'Ninja', chakra: 2, power: 2 });
      const top = mockCharacter({ id: 'KS-931-C', name_fr: 'Ninja', chakra: 5, power: 6 });
      const stolen = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player2', missionIndex: 0, stack: [bottom, top] },
        top,
      );
      state.activeMissions[0].player1Characters.push(stolen);
      state.player1.charactersInPlay = 1;

      const after = defeatEnemyCharacter(state, 0, stolen.instanceId, 'player2');

      expect(after.player1.discardPile.length).toBe(0);
      expect(after.player2.discardPile.map((c) => c.id)).toEqual(['KS-930-C', 'KS-931-C']);
    });

    it('a bounce sends only the TOP card to hand and the cards under it to the discard', () => {
      const state = withMissions(['D']);
      const bottom = mockCharacter({ id: 'KS-930-C', name_fr: 'Ninja', chakra: 2, power: 2 });
      const middle = mockCharacter({ id: 'KS-931-C', name_fr: 'Ninja', chakra: 4, power: 4 });
      const top = mockCharacter({ id: 'KS-932-C', name_fr: 'Ninja', chakra: 6, power: 6 });
      const stack = mockCharInPlay(
        { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, stack: [bottom, middle, top] },
        top,
      );
      state.activeMissions[0].player1Characters.push(stack);
      state.player1.charactersInPlay = 1;
      const handBefore = state.player1.hand.length;

      const after = returnCharacterToHand(state, stack.instanceId, 'player1');

      expect(after.player1.hand.length).toBe(handBefore + 1);
      expect(after.player1.hand[after.player1.hand.length - 1].id).toBe('KS-932-C');
      expect(after.player1.discardPile.map((c) => c.id)).toEqual(['KS-930-C', 'KS-931-C']);
      expect(after.activeMissions[0].player1Characters.length).toBe(0);
    });

    it('counts an upgraded stack as a single character for the start-phase chakra count', () => {
      const state = withMissions(['D']);
      state.player1.chakra = 0;
      const bottom = mockCharacter({ id: 'KS-930-C', name_fr: 'Ninja', chakra: 2, power: 2 });
      const top = mockCharacter({ id: 'KS-931-C', name_fr: 'Ninja', chakra: 5, power: 6 });
      state.activeMissions[0].player1Characters.push(
        mockCharInPlay(
          { controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, stack: [bottom, top] },
          top,
        ),
      );

      const after = executeStartPhase(state);

      expect(after.player1.chakra).toBe(BASE_CHAKRA_PER_TURN + 1);
    });
  });
});
