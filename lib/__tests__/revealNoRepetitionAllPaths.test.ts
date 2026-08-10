import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { EffectEngine } from '../effects/EffectEngine';
import type { CharacterInPlay, GameState, PendingEffect, PlayerID } from '../engine/types';
import { createActionPhaseState, mockCharInPlay } from './testHelpers';

const ENGINE_SOURCE_PATH = 'lib/effects/EffectEngine.ts';

const REVEAL_GUARD_CALLS = [
  'revealWouldViolateNameUniqueness',
  'findLegalRevealUpgradeTarget',
  'canRevealHiddenCharacter',
  'dosu069EvaluateReveal',
];

function topCardOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

function visibleNamed(state: GameState, player: PlayerID, missionIndex: number, name: string): CharacterInPlay[] {
  const side = player === 'player1' ? 'player1Characters' : 'player2Characters';
  return state.activeMissions[missionIndex][side].filter(
    (c) => !c.isHidden && topCardOf(c).name_fr.toUpperCase() === name.toUpperCase(),
  );
}

function dosuConfirmMainPending(dosuInstanceId: string): PendingEffect {
  return {
    id: 'pending-dosu-confirm-main',
    sourceCardId: 'KS-069-UC',
    sourceInstanceId: dosuInstanceId,
    sourceMissionIndex: 0,
    effectType: 'MAIN',
    effectDescription: JSON.stringify({ sourceCardInstanceId: dosuInstanceId }),
    targetSelectionType: 'DOSU069_CONFIRM_MAIN',
    sourcePlayer: 'player1',
    requiresTargetSelection: true,
    validTargets: [dosuInstanceId],
    isOptional: true,
    isMandatory: false,
    resolved: false,
    isUpgrade: true,
  };
}

function dosuOpponentChoicePending(hiddenInstanceId: string, dosuInstanceId: string): PendingEffect {
  return {
    id: 'pending-dosu-opponent-choice',
    sourceCardId: 'KS-069-UC',
    sourceInstanceId: dosuInstanceId,
    sourceMissionIndex: 0,
    effectType: 'MAIN',
    effectDescription: JSON.stringify({
      targetInstanceId: hiddenInstanceId,
      revealCost: 5,
      sourcePlayer: 'player1',
    }),
    targetSelectionType: 'DOSU069_OPPONENT_CHOICE',
    sourcePlayer: 'player1',
    requiresTargetSelection: true,
    validTargets: [hiddenInstanceId],
    isOptional: true,
    isMandatory: false,
    resolved: false,
    isUpgrade: false,
    selectingPlayer: 'player2',
  };
}

interface BoardOpts {
  visibleChakra: number;
  hiddenChakra: number;
  visibleTokens?: number;
  hiddenTokens?: number;
  visibleOwner?: PlayerID;
}

function shikamaruBoard(opts: BoardOpts) {
  const state = createActionPhaseState({});
  state.player2.chakra = 20;

  const dosu = mockCharInPlay(
    { instanceId: 'inst-dosu', controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0, isHidden: false },
    { id: 'KS-069-UC', name_fr: 'Dosu Kinuta', chakra: 4, power: 3 },
  );

  const visibleShikamaru = mockCharInPlay(
    {
      instanceId: 'inst-shikamaru-visible',
      controlledBy: 'player2',
      originalOwner: opts.visibleOwner ?? 'player2',
      missionIndex: 0,
      isHidden: false,
      powerTokens: opts.visibleTokens ?? 0,
    },
    { id: 'KS-111-R', name_fr: 'Shikamaru Nara', chakra: opts.visibleChakra, power: 3 },
  );

  const hiddenShikamaru = mockCharInPlay(
    {
      instanceId: 'inst-shikamaru-hidden',
      controlledBy: 'player2',
      originalOwner: 'player2',
      missionIndex: 0,
      isHidden: true,
      wasRevealedAtLeastOnce: false,
      powerTokens: opts.hiddenTokens ?? 0,
    },
    { id: 'KS-021-C', name_fr: 'Shikamaru Nara', chakra: opts.hiddenChakra, power: 2 },
  );

  state.activeMissions[0].player1Characters = [dosu];
  state.activeMissions[0].player2Characters = [visibleShikamaru, hiddenShikamaru];

  return { state, dosu, visibleShikamaru, hiddenShikamaru };
}

describe('a reveal never puts two same-name characters face up on one side of a mission', () => {
  it('the reported Dosu Kinuta 069 board never offers the reveal that would duplicate Shikamaru Nara', () => {
    const { state, dosu, hiddenShikamaru } = shikamaruBoard({ visibleChakra: 5, hiddenChakra: 3 });
    const chakraBefore = state.player2.chakra;

    const afterDosu = EffectEngine.applyTargetedEffect(state, dosuConfirmMainPending(dosu.instanceId), [dosu.instanceId]);

    expect(
      afterDosu.pendingEffects.some((e) => e.targetSelectionType === 'DOSU069_OPPONENT_CHOICE'),
      'the opponent must never be offered a reveal that the rules forbid',
    ).toBe(false);
    expect(afterDosu.player2.chakra, 'a refused reveal costs no chakra').toBe(chakraBefore);
    expect(
      visibleNamed(afterDosu, 'player2', 0, 'Shikamaru Nara').length,
      'only one Shikamaru Nara may be face up on that side',
    ).toBe(1);
    expect(
      afterDosu.activeMissions[0].player2Characters.some((c) => c.instanceId === hiddenShikamaru.instanceId),
      'the hidden card is defeated instead of being revealed',
    ).toBe(false);
    expect(
      afterDosu.log.some((l) => l.messageKey === 'game.log.effect.dosu069DuplicateNameDefeat'),
      'the refusal is announced in the game log',
    ).toBe(true);
  });

  it('refuses the reveal again at resolution time, when the board changed after the choice was offered', () => {
    const { state, dosu, hiddenShikamaru } = shikamaruBoard({ visibleChakra: 5, hiddenChakra: 3 });
    const chakraBefore = state.player2.chakra;

    const resolved = EffectEngine.applyTargetedEffect(
      state,
      dosuOpponentChoicePending(hiddenShikamaru.instanceId, dosu.instanceId),
      [hiddenShikamaru.instanceId],
    );

    expect(
      visibleNamed(resolved, 'player2', 0, 'Shikamaru Nara').length,
      'accepting a stale reveal prompt must not create a duplicate either',
    ).toBe(1);
    expect(resolved.player2.chakra, 'the blocked reveal is checked before any payment').toBe(chakraBefore);
    expect(
      resolved.activeMissions[0].player2Characters.find((c) => c.instanceId === hiddenShikamaru.instanceId)?.isHidden,
      'the hidden card is never flipped face up',
    ).not.toBe(false);
  });

  it('refuses the reveal when the only same-name character is controlled by the opponent', () => {
    const { state, dosu, hiddenShikamaru } = shikamaruBoard({
      visibleChakra: 3,
      hiddenChakra: 5,
      visibleOwner: 'player1',
    });
    const chakraBefore = state.player2.chakra;

    const afterDosu = EffectEngine.applyTargetedEffect(state, dosuConfirmMainPending(dosu.instanceId), [dosu.instanceId]);

    expect(
      afterDosu.pendingEffects.some((e) => e.targetSelectionType === 'DOSU069_OPPONENT_CHOICE'),
      'a controlled character is not a legal upgrade target, so the reveal is illegal',
    ).toBe(false);
    expect(afterDosu.player2.chakra, 'a refused reveal costs no chakra').toBe(chakraBefore);
    expect(visibleNamed(afterDosu, 'player2', 0, 'Shikamaru Nara').length, 'still a single visible Shikamaru Nara').toBe(1);
    expect(
      afterDosu.activeMissions[0].player2Characters.some((c) => c.instanceId === hiddenShikamaru.instanceId),
      'the hidden card is defeated instead of being revealed',
    ).toBe(false);
  });

  it('merges the reveal into an upgrade when the hidden card costs strictly more', () => {
    const { state, dosu, visibleShikamaru, hiddenShikamaru } = shikamaruBoard({
      visibleChakra: 3,
      hiddenChakra: 5,
      visibleTokens: 2,
      hiddenTokens: 1,
    });

    const offered = EffectEngine.applyTargetedEffect(state, dosuConfirmMainPending(dosu.instanceId), [dosu.instanceId]);
    const choice = offered.pendingEffects.find((e) => e.targetSelectionType === 'DOSU069_OPPONENT_CHOICE');

    expect(choice, 'a legal reveal must still be offered').toBeDefined();
    expect(choice?.selectingPlayer, 'the owner of the hidden card decides').toBe('player2');

    const merged = EffectEngine.applyTargetedEffect(offered, choice as PendingEffect, [hiddenShikamaru.instanceId]);

    const survivors = visibleNamed(merged, 'player2', 0, 'Shikamaru Nara');
    expect(survivors.length, 'the upgrade leaves a single visible Shikamaru Nara').toBe(1);

    const survivor = survivors[0];
    expect(survivor.instanceId, 'the upgrade keeps the character already in play').toBe(visibleShikamaru.instanceId);
    expect(survivor.isHidden, 'the merged character is face up').toBe(false);
    expect(topCardOf(survivor).id, 'the revealed card becomes the top of the stack').toBe('KS-021-C');
    expect(survivor.stack.length, 'the stack grows instead of a second character appearing').toBe(2);
    expect(survivor.powerTokens, 'power tokens of both cards are kept on the stack').toBe(3);
    expect(
      merged.activeMissions[0].player2Characters.some((c) => c.instanceId === hiddenShikamaru.instanceId),
      'the hidden card no longer exists as a separate character',
    ).toBe(false);
    expect(merged.player2.chakra, 'the upgrade is paid as a cost difference plus the Dosu Kinuta surcharge').toBe(16);
  });

  it('reveals normally when no same-name character is face up on that side', () => {
    const { state, dosu, hiddenShikamaru } = shikamaruBoard({ visibleChakra: 5, hiddenChakra: 3 });
    state.activeMissions[0].player2Characters = [hiddenShikamaru];

    const offered = EffectEngine.applyTargetedEffect(state, dosuConfirmMainPending(dosu.instanceId), [dosu.instanceId]);
    const choice = offered.pendingEffects.find((e) => e.targetSelectionType === 'DOSU069_OPPONENT_CHOICE');
    expect(choice, 'an unobstructed reveal is still offered').toBeDefined();

    const revealed = EffectEngine.applyTargetedEffect(offered, choice as PendingEffect, [hiddenShikamaru.instanceId]);
    const target = revealed.activeMissions[0].player2Characters.find((c) => c.instanceId === hiddenShikamaru.instanceId);

    expect(target?.isHidden, 'the reveal happens as usual').toBe(false);
    expect(revealed.player2.chakra, 'the printed cost plus the Dosu Kinuta surcharge is paid').toBe(20 - (3 + 2));
  });
});

describe('every reveal site of the effect engine is covered by the central No Repetition guard', () => {
  const source = readFileSync(ENGINE_SOURCE_PATH, 'utf8');
  const lines = source.split('\n');

  const regionBoundaries: number[] = [];
  lines.forEach((line, index) => {
    if (/^\s*(case\s+'[A-Za-z0-9_]+'\s*:|static\s+[A-Za-z0-9_]+\s*\(|(?:export\s+)?function\s+[A-Za-z0-9_]+\s*\()/.test(line)) {
      regionBoundaries.push(index);
    }
  });

  function regionStartOf(index: number): number {
    let start = 0;
    for (const boundary of regionBoundaries) {
      if (boundary > index) break;
      start = boundary;
    }
    return start;
  }

  function isFreshCharacterEntry(index: number): boolean {
    if (lines[index].includes('instanceId:')) return true;
    return lines
      .slice(Math.max(0, index - 6), index)
      .some((line) => /instanceId:\s*generateInstanceId\(\)/.test(line));
  }

  const revealSites = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /isHidden:\s*false|isHidden\s*=\s*false/.test(line))
    .filter(({ index }) => !isFreshCharacterEntry(index));

  it('imports the central guard instead of rolling its own name check', () => {
    expect(source, 'EffectEngine must read the No Repetition rule from one place').toContain(
      "from './revealNameUniqueness'",
    );
  });

  it('finds the reveal sites it is supposed to police', () => {
    expect(revealSites.length, 'the scan must actually match the reveal sites of the engine').toBeGreaterThanOrEqual(8);
  });

  it('guards each site that turns a hidden character face up', () => {
    const unguarded = revealSites
      .filter(({ index }) => {
        const region = lines.slice(regionStartOf(index), index).join('\n');
        return !REVEAL_GUARD_CALLS.some((guard) => region.includes(guard));
      })
      .map(({ line, index }) => `${ENGINE_SOURCE_PATH}:${index + 1}  ${line.trim().slice(0, 90)}`);

    expect(
      unguarded,
      `these reveal a hidden character without asking the central guard first, so they can duplicate a name:\n  ${unguarded.join('\n  ')}`,
    ).toEqual([]);
  });
});
