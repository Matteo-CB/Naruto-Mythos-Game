import type { EffectContext, EffectResult } from '../../EffectTypes';
import { registerEffect } from '../../EffectRegistry';
import type { CharacterInPlay } from '../../../engine/types';
import { logAction } from '../../../engine/utils/gameLog';

/**
 * Card 134/130 - KYUBI (S)
 * Chakra: 8, Power: 9
 * Group: Independent, Keywords: Summon
 *
 * MAIN [continuous]: Can't be hidden or defeated by enemy effects.
 *   - Continuous no-op. The engine handles defeat replacement and hide immunity
 *     via ContinuousEffects / EffectEngine.checkDefeatReplacement.
 *
 * UPGRADE: Hide any number of non-hidden characters (from any player, not self)
 *          with total Power 6 or less.
 *   - For auto-resolution: greedily pick enemy characters starting from weakest
 *     until the total power reaches 6 or no more valid targets.
 *   - All selected characters are hidden simultaneously.
 */

function getEffectivePower(char: CharacterInPlay): number {
  if (char.isHidden) return 0;
  const topCard = char.stack.length > 0 ? char.stack[char.stack.length - 1] : char.card;
  return topCard.power + char.powerTokens;
}

function kyubi134MainHandler(ctx: EffectContext): EffectResult {
  // Continuous immunity - handled by ContinuousEffects engine
  const log = logAction(
    ctx.state.log, ctx.state.turn, ctx.state.phase, ctx.sourcePlayer,
    'EFFECT_CONTINUOUS',
    'Kyubi (134): Cannot be hidden or defeated by enemy effects (continuous).',
    'game.log.effect.continuous',
    { card: 'KYUBI', id: '134/130' },
  );
  return { state: { ...ctx.state, log } };
}

function kyubi134UpgradeHandler(ctx: EffectContext): EffectResult {
  let state = { ...ctx.state };

  // Collect all non-hidden characters across all missions (any player, not self)
  const candidates: { char: CharacterInPlay; missionIndex: number; side: 'player1Characters' | 'player2Characters'; power: number }[] = [];

  for (let i = 0; i < state.activeMissions.length; i++) {
    const mission = state.activeMissions[i];
    for (const side of ['player1Characters', 'player2Characters'] as const) {
      for (const char of mission[side]) {
        if (char.isHidden) continue;
        if (char.instanceId === ctx.sourceCard.instanceId) continue;
        const power = getEffectivePower(char);
        candidates.push({ char, missionIndex: i, side, power });
      }
    }
  }

  if (candidates.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kyubi (134): No non-hidden characters to hide (upgrade).',
      'game.log.effect.noTarget',
      { card: 'KYUBI', id: '134/130' },
    );
    return { state: { ...state, log } };
  }

  // Auto-resolution: greedily select enemies first (weakest first), then friendlies,
  // keeping total power <= 6
  const enemySide: 'player1Characters' | 'player2Characters' =
    ctx.sourcePlayer === 'player1' ? 'player2Characters' : 'player1Characters';

  // Prioritize enemies, sorted by power ascending
  const enemyCandidates = candidates
    .filter((c) => c.side === enemySide)
    .sort((a, b) => a.power - b.power);

  const friendlyCandidates = candidates
    .filter((c) => c.side !== enemySide)
    .sort((a, b) => a.power - b.power);

  const selected: typeof candidates = [];
  let totalPower = 0;

  // Pick enemies first
  for (const candidate of enemyCandidates) {
    if (totalPower + candidate.power <= 6) {
      selected.push(candidate);
      totalPower += candidate.power;
    }
  }

  // Then pick friendlies if room remains (generally strategic AI won't, but auto-resolve is greedy on enemies)
  // In practice, we skip friendlies for auto-resolution to avoid self-harm
  // The target selection path allows the player to include friendlies if desired

  if (selected.length === 0) {
    // No enemies fit, try friendlies
    for (const candidate of friendlyCandidates) {
      if (totalPower + candidate.power <= 6) {
        selected.push(candidate);
        totalPower += candidate.power;
      }
    }
  }

  if (selected.length === 0) {
    const log = logAction(
      state.log, state.turn, state.phase, ctx.sourcePlayer,
      'EFFECT_NO_TARGET',
      'Kyubi (134): No characters with total power 6 or less to hide (upgrade).',
      'game.log.effect.noTarget',
      { card: 'KYUBI', id: '134/130' },
    );
    return { state: { ...state, log } };
  }

  // Apply hide to all selected characters
  const missions = [...state.activeMissions];
  const hiddenNames: string[] = [];

  for (const sel of selected) {
    const mission = { ...missions[sel.missionIndex] };
    const chars = [...mission[sel.side]];
    const idx = chars.findIndex((c) => c.instanceId === sel.char.instanceId);
    if (idx !== -1) {
      chars[idx] = { ...chars[idx], isHidden: true };
      mission[sel.side] = chars;
      missions[sel.missionIndex] = mission;
      hiddenNames.push(sel.char.card.name_fr);
    }
  }

  const log = logAction(
    state.log, state.turn, state.phase, ctx.sourcePlayer,
    'EFFECT_HIDE',
    `Kyubi (134): Hid ${selected.length} character(s) (total Power ${totalPower}): ${hiddenNames.join(', ')} (upgrade).`,
    'game.log.effect.hideMultiple',
    { card: 'KYUBI', id: '134/130', count: selected.length, totalPower },
  );

  return { state: { ...state, activeMissions: missions, log } };
}

export function registerKyubi134Handlers(): void {
  registerEffect('134/130', 'MAIN', kyubi134MainHandler);
  registerEffect('134/130', 'UPGRADE', kyubi134UpgradeHandler);
}
