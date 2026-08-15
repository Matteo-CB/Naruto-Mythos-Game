import { describe, it, expect } from 'vitest';
import {
  attachCardToCharacter,
  enforceAttachmentConditions,
  getCharacterAttachTargets,
  parseAttachSpec,
} from '@/lib/effects/attachments';
import { buildSimState, simChar } from '@/lib/cards/sim/buildState';
import { getCardById } from '@/lib/data/cardIndex';
import { getPlayableAttachments } from '@/lib/data/cardLoader';
import type { CardData, CharacterInPlay, GameState } from '@/lib/engine/types';

const POIDS = 'SS-087-UC';
const SAMEHADA = 'SS-090-UC';
const ROCK_LEE = 'SS-020-C';

function carte(id: string): CardData {
  const trouvee = getCardById(id);
  expect(trouvee, `${id} existe`).toBeTruthy();
  return trouvee as unknown as CardData;
}

function plateauAvec(hoteId: string): GameState {
  const state = buildSimState({
    p1: [simChar(hoteId, { owner: 'player1', instanceId: 'hote' })],
    missions: 2,
    chakra1: 30,
    edgeHolder: 'player1',
  });
  state.phase = 'action';
  return state;
}

function hote(state: GameState): CharacterInPlay {
  for (const mission of state.activeMissions) {
    const trouve = mission.player1Characters.find((c) => c.instanceId === 'hote');
    if (trouve) return trouve;
  }
  throw new Error('hote introuvable');
}

describe('un equipement reste sur un hote choisi par son nom ou son mot-cle', () => {
  it('les Poids ne disparaissent pas de Rock Lee', () => {
    let state = plateauAvec(ROCK_LEE);
    const cibles = getCharacterAttachTargets(state, 'player1', 0, carte(POIDS));
    expect(cibles.map((c) => c.instanceId), 'Rock Lee est une cible legale').toContain('hote');

    state = attachCardToCharacter(state, 'player1', carte(POIDS), 'hote');
    expect(hote(state).attachments?.length, 'les Poids sont bien poses').toBe(1);

    state = enforceAttachmentConditions(state);
    expect(hote(state).attachments?.length, 'les Poids restent apres verification').toBe(1);
    expect(state.player1.discardPile.map((c) => c.id), 'rien ne part a la defausse').not.toContain(POIDS);
  });

  it('ce qui est propose au joueur est exactement ce qui est conserve', () => {
    for (const attachement of getPlayableAttachments()) {
      const donnees = attachement as unknown as CardData;
      if (parseAttachSpec(donnees).toMission) continue;
      for (const hoteId of [ROCK_LEE, 'KS-001-C', 'KS-128-R']) {
        let state = plateauAvec(hoteId);
        const propose = getCharacterAttachTargets(state, 'player1', 0, donnees)
          .some((c) => c.instanceId === 'hote');
        if (!propose) continue;
        state = attachCardToCharacter(state, 'player1', donnees, 'hote');
        state = enforceAttachmentConditions(state);
        expect(
          hote(state).attachments?.length,
          `${donnees.id} ${donnees.name_fr} propose sur ${hoteId} doit y rester`,
        ).toBe(1);
      }
    }
  });

  it('poser un second equipement ne defausse que le premier', () => {
    let state = plateauAvec(ROCK_LEE);
    state = attachCardToCharacter(state, 'player1', carte(POIDS), 'hote');
    const avant = state.player1.discardPile.length;

    state = attachCardToCharacter(state, 'player1', carte(POIDS), 'hote');
    state = enforceAttachmentConditions(state);

    const porte = hote(state).attachments ?? [];
    expect(porte.length, 'un seul equipement par joueur sur un personnage').toBe(1);
    expect(porte[0].card.id, 'le nouvel equipement est celui qui reste').toBe(POIDS);
    expect(state.player1.discardPile.length, 'une seule carte part a la defausse').toBe(avant + 1);
  });

  it('Samehada tient sur un Deserteur qui n_est pas de l_Akatsuki', () => {
    const deserteur = getCharacterAttachTargets(
      plateauAvec('KS-001-C'), 'player1', 0, carte(SAMEHADA),
    );
    expect(deserteur.length, 'Hiruzen n_est ni Akatsuki ni Deserteur').toBe(0);
  });
});
