import type { EffectContext, EffectResult } from '@/lib/effects/EffectTypes';
import type { CardData, CharacterInPlay, GameState, PlayerID } from '@/lib/engine/types';
import { registerEffect } from '@/lib/effects/EffectRegistry';
import { logAction } from '@/lib/engine/utils/gameLog';
import { annoncerRevelationPublique, apercuRevele } from '@/lib/effects/publicReveal';
import { confirmFirst } from './confirmFirst';

export const IBIKI_029 = 'SS-029-UC';

function topOf(char: CharacterInPlay) {
  return char.stack?.length > 0 ? char.stack[char.stack.length - 1] : char.card;
}

function memeNom(a: CardData, b: CardData): boolean {
  const gauche = `${a.name_fr ?? ''}|${a.name_en ?? ''}`.toUpperCase();
  const droite = `${b.name_fr ?? ''}|${b.name_en ?? ''}`.toUpperCase();
  return gauche === droite;
}

export function sommetAdverse(state: GameState, player: PlayerID): CardData | null {
  const adversaire: PlayerID = player === 'player1' ? 'player2' : 'player1';
  return (state[adversaire].deck[0] as unknown as CardData) ?? null;
}

export function ennemisDuMemeNom(
  state: GameState,
  player: PlayerID,
  carte: CardData,
): CharacterInPlay[] {
  const adversaire: PlayerID = player === 'player1' ? 'player2' : 'player1';
  const side = adversaire === 'player1' ? 'player1Characters' : 'player2Characters';
  const trouves: CharacterInPlay[] = [];
  for (const mission of state.activeMissions) {
    for (const c of mission[side]) {
      if (c.isHidden) continue;
      if (memeNom(topOf(c) as unknown as CardData, carte)) trouves.push(c);
    }
  }
  return trouves;
}

function ibiki029(ctx: EffectContext): EffectResult {
  const { state, sourcePlayer, sourceCard } = ctx;
  const carte = sommetAdverse(state, sourcePlayer);
  if (!carte) {
    return {
      state: {
        ...state,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Ibiki Morino (029): the opponent deck is empty.',
          'game.log.effect.noTarget', { card: 'IBIKI MORINO', id: IBIKI_029 }),
      },
    };
  }

  const avecRevelation = annoncerRevelationPublique(state, sourcePlayer, IBIKI_029, [apercuRevele(carte, true)]);

  const cibles = ennemisDuMemeNom(state, sourcePlayer, carte);
  if (cibles.length === 0) {
    return {
      state: {
        ...avecRevelation,
        log: logAction(state.log, state.turn, state.phase, sourcePlayer, 'EFFECT_NO_TARGET',
          'Ibiki Morino (029): no enemy character shares the name of the revealed card.',
          'game.log.effect.noTarget', { card: 'IBIKI MORINO', id: IBIKI_029 }),
      },
    };
  }

  return confirmFirst({
    state: avecRevelation,
    requiresTargetSelection: true,
    targetSelectionType: 'SS029_HIDE_SAME_NAME',
    validTargets: cibles.map((c) => c.instanceId),
    isOptional: true,
    description: JSON.stringify({ revealed: carte.name_fr, revealed_en: carte.name_en ?? carte.name_fr }),
    descriptionKey: 'game.effect.desc.ss029HideSameName',
  }, sourceCard.instanceId, 'SS029_CONFIRM_MAIN');
}

export function registerNameRevealHandlers(): void {
  registerEffect(IBIKI_029, 'MAIN', ibiki029);
}
