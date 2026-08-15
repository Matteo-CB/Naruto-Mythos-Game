import { describe, it, expect } from 'vitest';
import { attachCardToCharacter, enforceAttachmentConditions } from '@/lib/effects/attachments';
import { textIsBlanked } from '@/lib/effects/handlers/SS/attachmentStatics';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import type { CardData, CharacterInPlay, GameState } from '@/lib/engine/types';

const BOMBE = 'SS-083-UC';
const ENNEMI = 'KS-125-R';

function ennemi(state: GameState, instanceId: string): CharacterInPlay {
  for (const mission of state.activeMissions) {
    const trouve = mission.player2Characters.find((c) => c.instanceId === instanceId);
    if (trouve) return trouve;
  }
  throw new Error(`${instanceId} introuvable`);
}

describe('deux Bombes Aveuglantes sur deux ennemis differents', () => {
  it('chacune efface le texte de son propre porteur, et de lui seul', () => {
    let state: GameState = buildSimState({
      p1: [simChar('KS-001-C', { owner: 'player1', instanceId: 'moi' })],
      p2: [
        simChar(ENNEMI, { owner: 'player2', instanceId: 'cibleA' }),
        simChar(ENNEMI, { owner: 'player2', instanceId: 'cibleB' }),
        simChar(ENNEMI, { owner: 'player2', instanceId: 'temoin' }),
      ],
      missions: 2,
      chakra1: 40,
      edgeHolder: 'player1',
    });
    state.phase = 'action';

    state = attachCardToCharacter(state, 'player1', getCardById(BOMBE) as CardData, 'cibleA');
    state = attachCardToCharacter(state, 'player1', getCardById(BOMBE) as CardData, 'cibleB');
    state = enforceAttachmentConditions(state);

    expect(ennemi(state, 'cibleA').attachments?.length, 'la premiere reste posee').toBe(1);
    expect(ennemi(state, 'cibleB').attachments?.length, 'la seconde reste posee').toBe(1);

    expect(textIsBlanked(ennemi(state, 'cibleA')), 'le texte du premier porteur est efface').toBe(true);
    expect(textIsBlanked(ennemi(state, 'cibleB')), 'le texte du second porteur est efface').toBe(true);
    expect(textIsBlanked(ennemi(state, 'temoin')), 'un ennemi sans bombe garde son texte').toBe(false);
  });
});
