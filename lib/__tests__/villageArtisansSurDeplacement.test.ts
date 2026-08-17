import { describe, it, expect } from 'vitest';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { attachCardToCharacter, attachCardToMission } from '@/lib/effects/attachments';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData, CharacterCard, GameState } from '@/lib/engine/types';

const VILLAGE = 'SS-110-UC';
const ARME = 'SS-080-C';
const SEIMEI = 'SS-065-UC';
const PORTEUR = 'KS-011-C';

function plateau(nombreArmes: number): { state: GameState; armes: string[] } {
  let state = buildSimState({
    p1: [
      simChar(SEIMEI, { owner: 'player1', instanceId: 'seimei' }),
      ...Array.from({ length: nombreArmes }, (_, i) =>
        simChar(PORTEUR, { owner: 'player1', instanceId: `porteur${i}`, missionIndex: 1 })),
    ],
    missions: 2, chakra1: 30, edgeHolder: 'player1',
  });
  state.phase = 'action';
  state.player1.deck = Array.from({ length: 10 }, () => getCardById(PORTEUR) as CharacterCard);

  for (let i = 0; i < nombreArmes; i++) {
    state.activeMissions[1].player1Characters.push(state.activeMissions[0].player1Characters.pop()!);
  }
  state = attachCardToMission(state, 'player1', getCardById(VILLAGE) as CardData, 0);

  const armes: string[] = [];
  for (let i = 0; i < nombreArmes; i++) {
    state = attachCardToCharacter(state, 'player1', getCardById(ARME) as CardData, `porteur${i}`);
    const hote = state.activeMissions[1].player1Characters.find((c) => c.instanceId === `porteur${i}`)!;
    armes.push(hote.attachments![hote.attachments!.length - 1].instanceId);
  }
  return { state, armes };
}

describe('Village des artisans recompense aussi les equipements deplaces', () => {
  it('deplacer 4 armes sur Seimei fait piocher 4 et donne 4 jetons', () => {
    const { state, armes } = plateau(4);
    const mainAvant = state.player1.hand.length;

    let courant = state;
    for (const arme of armes) {
      courant = EffectEngine.deplacerEquipement(courant, arme, 'seimei', 'SS-065-UC');
    }

    const seimei = courant.activeMissions[0].player1Characters.find((c) => c.instanceId === 'seimei')!;
    expect(seimei.attachments?.length, 'les quatre armes sont sur Seimei').toBe(4);
    expect(seimei.powerTokens, 'quatre jetons de puissance').toBe(4);
    expect(courant.player1.hand.length - mainAvant, 'quatre cartes piochees').toBe(4);
  });

  it('sans le Village, un deplacement ne rapporte rien', () => {
    const { state, armes } = plateau(2);
    const sansVillage: GameState = {
      ...state,
      activeMissions: state.activeMissions.map((m, i) => (i === 0 ? { ...m, attachments: [] } : m)),
    };
    const mainAvant = sansVillage.player1.hand.length;

    let courant = sansVillage;
    for (const arme of armes) {
      courant = EffectEngine.deplacerEquipement(courant, arme, 'seimei', 'SS-065-UC');
    }

    const seimei = courant.activeMissions[0].player1Characters.find((c) => c.instanceId === 'seimei')!;
    expect(seimei.powerTokens, 'aucun jeton').toBe(0);
    expect(courant.player1.hand.length, 'aucune pioche').toBe(mainAvant);
  });
});
